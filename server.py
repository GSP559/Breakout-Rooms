from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI()

app.mount("/static", StaticFiles(directory="build/static"), name="static")

@app.get("/")
async def serve_react_app():
    return FileResponse("build/index.html")

# Data structures
instructor_ws: WebSocket = None  # Will hold the instructor's WebSocket
main_room: Set[WebSocket] = set()
breakout_rooms: Dict[str, Set[WebSocket]] = {}
user_role: Dict[WebSocket, str] = {}   # "instructor" or "student"
user_room: Dict[WebSocket, str] = {}   # room_id or "waiting"
status_connections: Set[WebSocket] = set()  # Clients connected to /ws/status

# For assigning student IDs
student_id_counter = 1
userId_ws_map: Dict[str, WebSocket] = {}
ws_userId_map: Dict[WebSocket, str] = {}
private_messaging_enabled = True
main_room_created = False  # Flag to track if the main room is created
###################################################################################################################
@app.websocket("/ws/status")
async def status_endpoint(ws: WebSocket):
    await ws.accept()
    
    status_connections.add(ws)
    # Send current instructor status
    instructor_connected = (instructor_ws is not None)
    await ws.send_text(json.dumps({
        "type": "INSTRUCTOR_STATUS",
        "connected": instructor_connected
    }))
     # Send current main room status
    await ws.send_text(json.dumps({
        "type": "MAIN_ROOM_STATUS",
        "created": main_room_created
    }))
    try:
        while True:
            _ = await ws.receive_text()
    except WebSocketDisconnect:
        status_connections.discard(ws)
###################################################################################################################
@app.websocket("/ws/instructor")
async def instructor_endpoint(ws: WebSocket):
    global instructor_ws
    user_role[ws] = "instructor"
    instructor_ws = ws
    user_room[ws] = "main"
    await ws.accept()

    # Broadcast instructor status update
    await broadcast_instructor_status(True)

    try:
        while True:
            data = await ws.receive_text()
            data = json.loads(data)
            await handle_instructor_message(ws, data)
    except WebSocketDisconnect:
        if ws in main_room:
            main_room.discard(ws)
        instructor_ws = None
        user_role.pop(ws, None)
        user_room.pop(ws, None)
        await broadcast_instructor_status(False)
    finally:
        await send_student_list()
###################################################################################################################
# server.py
@app.websocket("/ws/student")
async def student_endpoint(ws: WebSocket):
    global student_id_counter
    await ws.accept()
    user_role[ws] = "student"
    user_id = f"student{student_id_counter}"
    student_id_counter += 1

    ws_userId_map[ws] = user_id
    userId_ws_map[user_id] = ws

    # Send the assigned user_id to the student
    await ws.send_text(json.dumps({
        "type": "ASSIGN_ID",
        "userId": user_id
    }))

    if main_room_created:
        # Main room has been created; place student in main room
        user_room[ws] = "main"
        main_room.add(ws)
        await ws.send_text(json.dumps({"type": "ROOM_CHANGE", "roomId": "main"}))
    else:
        # Place student in waiting room
        user_room[ws] = "waiting"
        await ws.send_text(json.dumps({"type": "ROOM_CHANGE", "roomId": "waiting"}))

    # Send the current main room status to the student
    await ws.send_text(json.dumps({
        "type": "MAIN_ROOM_STATUS",
        "created": main_room_created
    }))

    # Update the instructor with the current list of students
    await send_student_list()

    try:
        while True:
            data = await ws.receive_text()
            data = json.loads(data)
            await handle_student_message(ws, data)
    except WebSocketDisconnect:
        user_id = ws_userId_map.get(ws)
        # Clean up on disconnect
        user_role.pop(ws, None)
        user_room.pop(ws, None)
        ws_userId_map.pop(ws, None)
        userId_ws_map.pop(user_id, None)
        main_room.discard(ws)
        # Remove from breakout rooms
        for room_students in breakout_rooms.values():
            room_students.discard(ws)
        await send_student_list()
###################################################################################################################
async def handle_instructor_message(ws: WebSocket, data: dict):
    global private_messaging_enabled, main_room_created
    msg_type = data.get("type")

    if msg_type == "TOGGLE_PRIVATE_MESSAGING":
        private_messaging_enabled = data.get("enabled", True)
        # Send ACK only to the instructor
        await ws.send_text(json.dumps({"type": "ACK", "message": f"Private messaging {'enabled' if private_messaging_enabled else 'disabled'}"}))
        # Broadcast the status to all students
        for student_ws in list(user_role.keys()):
            if user_role[student_ws] == "student":
                await student_ws.send_text(json.dumps({
                    "type": "PRIVATE_MESSAGING_STATUS",
                    "enabled": private_messaging_enabled
                }))

    elif msg_type == "WHISPER":
        recipient_id = data.get("to")
        content = data.get("content", "")
        student_ws = userId_ws_map.get(recipient_id)
        if student_ws:
            message = json.dumps({
                "type": "WHISPER",
                "from": "Instructor",
                "content": content
            })
            await student_ws.send_text(message)
            # Acknowledge to the instructor
            await ws.send_text(json.dumps({"type": "ACK", "message": f"Whisper sent to {recipient_id}"}))
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": f"Student {recipient_id} not found"}))

    elif msg_type == "BROADCAST_MAIN":
        content = data.get("content", "")
        message = json.dumps({
            "type": "MAIN_BROADCAST",
            "from": "Instructor",
            "content": content,
            "roomId": "main",
        })
        for s in main_room:
            await s.send_text(message)
        await ws.send_text(json.dumps({"type": "ACK", "message": "Message broadcasted to main room"}))

    elif msg_type == "BROADCAST_CURRENT_ROOM":
        content = data.get("content", "")
        room_id = user_room.get(ws)
        message = json.dumps({
            "type": "BREAKOUT_BROADCAST",
            "from": "Instructor",
            "content": content,
            "roomId": room_id,
        })
        if room_id == "main":
            for s in main_room:
                await s.send_text(message)
        elif room_id in breakout_rooms:
            for s in breakout_rooms[room_id]:
                await s.send_text(message)
        await ws.send_text(json.dumps({"type": "ACK", "message": f"Message broadcasted to {room_id}"}))

    elif msg_type == "BROADCAST_BREAKOUT_ONLY":
        content = data.get("content", "")
        message = json.dumps({
            "type": "BREAKOUT_ONLY_BROADCAST",
            "from": "Instructor",
            "content": content,
        })
        print(f"Broadcasting to breakout rooms: {breakout_rooms.keys()}")

    # Send this message to all students in breakout rooms only
        for student_ws, role in user_role.items():
            if role == "student":
            # Check if the student's current room is a breakout room (not main, not waiting)
                current_r = user_room.get(student_ws)
            # A breakout room should be defined as any room in 'breakout_rooms' dictionary
                if current_r != "main" and current_r in breakout_rooms:
                    try:
                        await student_ws.send_text(message)
                        print(f"Broadcasted breakout-only message to {ws_userId_map.get(student_ws, 'Unknown')}")
                    except Exception as e:
                        print(f"Failed to send BREAKOUT_ONLY_BROADCAST to {ws_userId_map.get(student_ws, 'Unknown')}: {e}")

    # Acknowledge the instructor
        await ws.send_text(json.dumps({"type": "ACK", "message": "Message broadcasted to all breakout rooms"}))

    elif msg_type == "BROADCAST_ALL":
        content = data.get("content", "")
        message = json.dumps({
        "type": "GLOBAL_BROADCAST",
        "from": "Instructor",
        "content": content,
    })

    # Send the message to all students in main room and breakout rooms
        for student_ws, role in user_role.items():
            if role == "student":  # Send only to students
                try:
                    await student_ws.send_text(message)
                    print(f"Broadcasted to {ws_userId_map.get(student_ws, 'Unknown')}")
                except Exception as e:
                    print(f"Failed to send GLOBAL_BROADCAST to {ws_userId_map.get(student_ws, 'Unknown')}: {e}")

    # Acknowledge the instructor
        await ws.send_text(json.dumps({"type": "ACK", "message": "Message broadcasted globally"}))


    elif msg_type == "JOIN_BREAKOUT":
        room_id = data.get("roomId")
        if room_id == "main":
            # Move instructor to the main room
            user_room[ws] = "main"
            await ws.send_text(json.dumps({"type": "ROOM_CHANGE", "roomId": "main"}))
        elif room_id and room_id in breakout_rooms:
            # Move instructor to the breakout room
            user_room[ws] = room_id
            await ws.send_text(json.dumps({"type": "ROOM_CHANGE", "roomId": room_id}))
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": f"Breakout room {room_id} not found"}))
        for student_ws in user_role:
            if user_role[student_ws] == "student":
                await student_ws.send_text(json.dumps({
                    "type": "INSTRUCTOR_ROOM_CHANGE",
                    "roomId": room_id
                }))


    elif msg_type == "CREATE_BREAKOUT":
        room_id = data.get("roomId")
        if room_id and room_id not in breakout_rooms:
            breakout_rooms[room_id] = set()
            await ws.send_text(json.dumps({"type": "ACK", "message": f"Breakout room {room_id} created"}))
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": f"Breakout room {room_id} already exists"}))

    elif msg_type == "MOVE_TO_BREAKOUT":
        user_id = data.get("userId")
        room_id = data.get("roomId")
        student_ws = userId_ws_map.get(user_id)

        if student_ws:
            # Remove student from previous room
            prev_room = user_room.get(student_ws)
            if prev_room == "main":
                main_room.discard(student_ws)
            elif prev_room in breakout_rooms:
                breakout_rooms[prev_room].discard(student_ws)
            # Add student to new breakout room
            if room_id not in breakout_rooms:
                breakout_rooms[room_id] = set()
            breakout_rooms[room_id].add(student_ws)
            user_room[student_ws] = room_id

            await student_ws.send_text(json.dumps({"type": "ROOM_CHANGE", "roomId": room_id}))
            await ws.send_text(json.dumps({"type": "ACK", "message": f"Moved user {user_id} to {room_id}"}))
            await send_student_list()
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": f"Student {user_id} not found"}))

    elif msg_type == "CLOSE_BREAKOUT":
        room_id = data.get("roomId")
        if room_id in breakout_rooms:
            students_in_room = breakout_rooms.pop(room_id)
            for student_ws in students_in_room:
                main_room.add(student_ws)
                user_room[student_ws] = "main"
                await student_ws.send_text(json.dumps({"type": "ROOM_CHANGE", "roomId": "main"}))
            await ws.send_text(json.dumps({"type": "ACK", "message": f"Breakout room {room_id} closed"}))
            await send_student_list()
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": f"Breakout room {room_id} not found"}))

    elif msg_type == "CREATE_MAIN_ROOM":
        main_room_created = True
        # Move all students from waiting room to main room
        for student_ws in list(user_role.keys()):
            if user_role[student_ws] == "student" and user_room[student_ws] == "waiting":
                main_room.add(student_ws)
                user_room[student_ws] = "main"
                await student_ws.send_text(json.dumps({"type": "ROOM_CHANGE", "roomId": "main"}))
        await ws.send_text(json.dumps({"type": "ACK", "message": "Main room created and students moved"}))
        await send_student_list()
        await broadcast_main_room_status()  # Broadcast the main room status

    else:
        unknown_type = data.get("type")
        error_message = f"Unknown message type: {unknown_type}"
        print(error_message)  # Log to server console
        await ws.send_text(json.dumps({"type": "ERROR", "message": error_message}))
###################################################################################################################        
async def handle_student_message(ws: WebSocket, data: dict):
    msg_type = data.get("type")
    user_id = ws_userId_map.get(ws, "Unknown")
    current_room = user_room.get(ws)

    if msg_type == "REQUEST_BREAKOUT":
        # Student requests a breakout room
        if instructor_ws is not None:
            await instructor_ws.send_text(json.dumps({
                "type": "BREAKOUT_REQUEST",
                "userId": user_id
            }))
            await ws.send_text(json.dumps({"type": "ACK", "message": "Breakout request sent"}))
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": "Instructor not connected"}))

    elif msg_type == "HELP_REQUEST":
        # Student requests help
        if instructor_ws is not None:
            await instructor_ws.send_text(json.dumps({
                "type": "HELP_REQUEST",
                "userId": user_id
            }))
            await ws.send_text(json.dumps({"type": "ACK", "message": "Help request sent"}))
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": "Instructor not connected"}))

    elif msg_type == "WHISPER":
        recipient_id = data.get("to", "Instructor")  # Default to Instructor
        content = data.get("content", "")

        if not private_messaging_enabled and recipient_id != "Instructor":
            await ws.send_text(json.dumps({"type": "ERROR", "message": "Private messaging is disabled"}))
            return

        if recipient_id == "Instructor" and instructor_ws:
            message = json.dumps({
                "type": "WHISPER",
                "from": user_id,
                "content": content
            })
            await instructor_ws.send_text(message)
            await ws.send_text(json.dumps({"type": "ACK", "message": "Whisper sent to Instructor"}))
        elif recipient_id in userId_ws_map:
            recipient_ws = userId_ws_map[recipient_id]
            message = json.dumps({
                "type": "WHISPER",
                "from": user_id,
                "content": content
            })
            await recipient_ws.send_text(message)
            await ws.send_text(json.dumps({"type": "ACK", "message": f"Whisper sent to {recipient_id}"}))
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": f"Recipient {recipient_id} not found"}))

    elif msg_type == "BROADCAST_MAIN":
        if current_room == "main":
            content = data.get("content", "")
            message = json.dumps({
                "type": "MAIN_BROADCAST",
                "from": user_id,
                "content": content,
                "roomId": "main",
            })
            for s in main_room:
                await s.send_text(message)
            if instructor_ws and user_room.get(instructor_ws) == "main":
                await instructor_ws.send_text(message)
            await ws.send_text(json.dumps({"type": "ACK", "message": "Message sent to main room"}))
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": "You are not in the main room"}))

    elif msg_type == "BROADCAST_BREAKOUT":
        if current_room != "main" and current_room in breakout_rooms:
            content = data.get("content", "")
            message = json.dumps({
                "type": "BREAKOUT_BROADCAST",
                "from": user_id,
                "content": content,
                "roomId": current_room,
            })
            for s in breakout_rooms[current_room]:
                await s.send_text(message)
            if instructor_ws and user_room.get(instructor_ws) == current_room:
                await instructor_ws.send_text(message)
            await ws.send_text(json.dumps({"type": "ACK", "message": f"Message sent to {current_room}"}))
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": "You are not in a breakout room"}))

    else:
        unknown_type = data.get("type")
        error_message = f"Unknown message type: {unknown_type}"
        print(error_message)  # Log to server console
        await ws.send_text(json.dumps({"type": "ERROR", "message": error_message}))
###################################################################################################################
async def broadcast_instructor_status(connected: bool):
    # Broadcast instructor connection status to all status connections
    status_msg = json.dumps({
        "type": "INSTRUCTOR_STATUS",
        "connected": connected
    })
    to_remove = []
    for w in status_connections:
        try:
            await w.send_text(status_msg)
        except Exception:
            to_remove.append(w)
    for w in to_remove:
        status_connections.remove(w)
###################################################################################################################
async def send_student_list():
    student_list = [
        {"userId": ws_userId_map[ws], "roomId": user_room.get(ws, "Unknown")}
        for ws in user_role
        if user_role[ws] == "student"
    ]
    # Send to instructor
    if instructor_ws:
        await instructor_ws.send_text(json.dumps({
            "type": "STUDENT_LIST",
            "students": student_list
        }))
    await send_student_list_to_students()
###################################################################################################################
async def send_student_list_to_students():
    student_list = [
        {"userId": ws_userId_map[ws], "roomId": user_room.get(ws, "Unknown")}
        for ws in user_role
        if user_role[ws] == "student"
    ]
    # Send to all students
    for ws in user_role:
        if user_role[ws] == "student":
            await ws.send_text(json.dumps({
                "type": "STUDENT_LIST",
                "students": student_list
            }))
###################################################################################################################
async def broadcast_main_room_status():
    status_msg = json.dumps({
        "type": "MAIN_ROOM_STATUS",
        "created": main_room_created
    })
    to_remove = []
    for w in status_connections:
        try:
            await w.send_text(status_msg)
        except WebSocketDisconnect:
            to_remove.append(w)
    for w in to_remove:
        status_connections.discard(w)