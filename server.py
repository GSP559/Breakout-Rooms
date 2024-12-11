from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json

app = FastAPI()

# Data structures
instructor_ws = None  # Will hold the instructor's WebSocket
main_room: Set[WebSocket] = set()
breakout_rooms: Dict[str, Set[WebSocket]] = {}
user_role: Dict[WebSocket, str] = {}   # "instructor" or "student"
user_room: Dict[WebSocket, str] = {}   # room_id or "main"
status_connections: Set[WebSocket] = set()  # Clients connected to /ws/status

# For assigning student IDs
student_id_counter = 1
userId_ws_map: Dict[str, WebSocket] = {}
ws_userId_map: Dict[WebSocket, str] = {}


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

    try:
        while True:
            _ = await ws.receive_text()
    except WebSocketDisconnect:
        if ws in status_connections:
            status_connections.remove(ws)


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
            message = await ws.receive_text()
            data = json.loads(message)
            await handle_instructor_message(ws, data)
    except WebSocketDisconnect:
        # Instructor disconnected
        if ws in user_role:
            del user_role[ws]
        if ws is instructor_ws:
            instructor_ws = None
            # Broadcast instructor status update
            await broadcast_instructor_status(False)
    await send_student_list()


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

    # If instructor is connected, place student in main room; else, waiting
    if instructor_ws:
        main_room.add(ws)
        user_room[ws] = "main"
    else:
        user_room[ws] = "waiting"

    # Update the instructor with the current list of students
    await send_student_list()

    try:
        while True:
            message = await ws.receive_text()
            data = json.loads(message)
            await handle_student_message(ws, data)
    except WebSocketDisconnect:
        # Remove student from all mappings
        role = user_role.get(ws)
        if role == "student":
            current_room = user_room.get(ws, "main")
            if current_room == "main" and ws in main_room:
                main_room.remove(ws)
            elif current_room in breakout_rooms and ws in breakout_rooms[current_room]:
                breakout_rooms[current_room].remove(ws)

        if ws in user_role:
            del user_role[ws]
        if ws in user_room:
            del user_room[ws]

        if ws in ws_userId_map:
            uid = ws_userId_map[ws]
            del ws_userId_map[ws]
            if uid in userId_ws_map:
                del userId_ws_map[uid]

        # Notify the instructor of the updated list
        await send_student_list()


async def handle_instructor_message(ws: WebSocket, data: dict):
    msg_type = data.get("type")
    
    if msg_type == "BREAKOUT_BROADCAST":
        content = data.get("content", "")
        # Send the message to all students not in 'main' room
        for student_ws in user_role:
            if user_role[student_ws] == "student" and user_room.get(student_ws) != "main":
                try:
                    await student_ws.send_text(json.dumps({
                        "type": "BREAKOUT_BROADCAST",
                        "from": "Instructor",
                        "content": content
                    }))
                except Exception as e:
                    print(f"Error sending BREAKOUT_BROADCAST to {student_ws}: {e}")

    if msg_type == "BROADCAST_ALL":
        # Broadcast a message to all students (main room and breakout rooms)
        content = data.get("content", "")
        # Send to all students in the main room
        for student_ws in main_room:
            await student_ws.send_text(json.dumps({
                "type": "GLOBAL_BROADCAST",
                "content": content,
                "from": "Instructor"
            }))
        # Send to all students in breakout rooms
        for room_id, students in breakout_rooms.items():
            for student_ws in students:
                await student_ws.send_text(json.dumps({
                    "type": "GLOBAL_BROADCAST",
                    "content": content,
                    "from": "Instructor"
                }))
        # Send acknowledgment to the instructor
        await ws.send_text(json.dumps({"type": "ACK", "message": "Message broadcasted to all students"}))

    if msg_type == "CREATE_MAIN_ROOM":
        # Main room is a global set defined. Just acknowledge.
        await ws.send_text(json.dumps({"type": "ACK", "message": "Main room created"}))
    
    elif msg_type == "WHISPER":
        recipient_id = data.get("to")
        content = data.get("content", "")
        student_ws = userId_ws_map.get(recipient_id)
        if student_ws:
        # Send whisper to the student
            await student_ws.send_text(json.dumps({
            "type": "WHISPER",
            "from": "Instructor",
            "content": content
        }))
        # Acknowledge to the instructor
            await ws.send_text(json.dumps({"type": "WHISPER_ACK", "message": f"Whisper sent to {recipient_id}"}))
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": f"Student {recipient_id} not found"}))


    elif msg_type == "BROADCAST_MAIN":
        content = data.get("content", "")
        for s in main_room:
            await s.send_text(json.dumps({
                "type": "MAIN_BROADCAST",
                "content": content,
                "from": "Instructor"}))

    elif msg_type == "CREATE_BREAKOUT":
        room_id = data.get("roomId")
        if room_id and room_id not in breakout_rooms:
            breakout_rooms[room_id] = set()
            print(f"Breakout room {room_id} created")  # Debug message
            await ws.send_text(json.dumps({
                "type": "ACK",
                "message": f"Breakout room {room_id} created"
        }))

    elif msg_type == "JOIN_BREAKOUT":
        room_id = data.get("roomId")
        if room_id and room_id in breakout_rooms:
            # Move instructor to the breakout room
            user_room[ws] = room_id
            await ws.send_text(json.dumps({"type": "ROOM_CHANGE", "roomId": room_id}))
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": f"Breakout room {room_id} not found"}))

    elif msg_type == "MOVE_TO_BREAKOUT":
        user_id = data.get("userId")
        room_id = data.get("roomId")
        student_ws = userId_ws_map.get(user_id)

        if student_ws:
            # Move student from main to breakout room
            if student_ws in main_room:
                main_room.remove(student_ws)
            breakout_rooms[room_id].add(student_ws)
            user_room[student_ws] = room_id

            await student_ws.send_text(json.dumps({"type": "ROOM_CHANGE", "roomId": room_id}))
            await ws.send_text(json.dumps({"type": "ACK", "message": f"Moved user {user_id} to {room_id}"}))
        else:
            await ws.send_text(json.dumps({"type": "ERROR", "message": f"{user_id} not found"}))

        
    elif msg_type == "CLOSE_BREAKOUT":
        room_id = data.get("roomId")
        if room_id in breakout_rooms:
            # Move all students back to main
            for s in list(breakout_rooms[room_id]):
                breakout_rooms[room_id].remove(s)
                main_room.add(s)
                user_room[s] = "main"
                await s.send_text(json.dumps({"type": "ROOM_CHANGE", "roomId": "main"}))
            # Check if the instructor is in the breakout room
            if user_room.get(ws) == room_id:
                user_room[ws] = "main"
                await ws.send_text(json.dumps({"type": "ROOM_CHANGE", "roomId": "main"}))
            del breakout_rooms[room_id]
            await ws.send_text(json.dumps({"type": "ACK", "message": f"Closed breakout room {room_id}"}))
            
        await send_student_list()

    elif msg_type == "BROADCAST_CURRENT_ROOM":
        content = data.get("content", "")
        room_id = data.get("roomId")
        if room_id == "main":
            for s in main_room:
                await s.send_text(json.dumps({
                    "type": "MAIN_BROADCAST",
                    "content": content,
                    "from": "Instructor"
                }))
        elif room_id in breakout_rooms:
            for s in breakout_rooms[room_id]:
                await s.send_text(json.dumps({
                    "type": "BREAKOUT_BROADCAST",
                    "content": content,
                    "from": "Instructor"
                }))
        await ws.send_text(json.dumps({"type": "ACK", "message": f"Message broadcasted to {room_id}"}))

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

    elif msg_type == "WHISPER":
        recipient_id = data.get("to", "Instructor")  # Default to Instructor
        content = data.get("content", "")
        if recipient_id == "Instructor" and instructor_ws:
        # Send whisper to the instructor
            await instructor_ws.send_text(json.dumps({
                "type": "WHISPER",
                "from": user_id,
                "content": content
            }))
        # Acknowledge to the student
            await ws.send_text(json.dumps({"type": "ACK", "message": f"Whisper sent to Instructor"}))
        else:
            # Whisper to another student
            recipient_ws = userId_ws_map.get(recipient_id)
            if recipient_ws:
                await recipient_ws.send_text(json.dumps({
                    "type": "WHISPER",
                    "from": user_id,
                    "content": content
                }))
                await ws.send_text(json.dumps({"type": "ACK", "message": f"Whisper sent to {recipient_id}"}))
            else:
                await ws.send_text(json.dumps({"type": "ERROR", "message": f"{recipient_id} not found"}))

    elif msg_type == "BROADCAST_MAIN":
        if user_room.get(ws) == "main":
            content = data.get("content", "")
            user_id = ws_userId_map.get(ws, "Unknown")  # Get student ID
            for s in main_room:
                await s.send_text(json.dumps({
                "type": "MAIN_BROADCAST",
                "content": content,
                "from": user_id  # Add "from" field for student messages
            }))
            if instructor_ws:
                await instructor_ws.send_text(json.dumps({
                    "type": "STUDENT_MESSAGE",
                    "from": user_id,
                    "content": content
                }))
    elif msg_type == "BROADCAST_BREAKOUT":
        # Handle broadcasting within the breakout room
        room_id = current_room
        content = data.get("content", "")
        if room_id in breakout_rooms:
            for s in breakout_rooms[room_id]:
                await s.send_text(json.dumps({
                    "type": "BREAKOUT_BROADCAST",
                    "content": content,
                    "from": user_id
                }))
        if instructor_ws:
                await instructor_ws.send_text(json.dumps({
                    "type": "BREAKOUT_BROADCAST",
                    "from": ws_userId_map[ws],
                    "content": content
                }))


    elif msg_type == "HELP_REQUEST":
        # Student requests help (in a breakout room)
        if instructor_ws:
            await instructor_ws.send_text(json.dumps({"type": "HELP_REQUEST", "userId": user_id}))


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
        except WebSocketDisconnect:
            to_remove.append(w)
    for w in to_remove:
        status_connections.remove(w)

async def send_student_list():
    student_list = [
        {"userId": ws_userId_map[ws], "room": user_room.get(ws, "Unknown")}
        for ws in user_role
        if user_role[ws] == "student"
    ]
    # Broadcast to instructor
    if instructor_ws:
        await instructor_ws.send_text(json.dumps({
            "type": "STUDENT_LIST",
            "students": student_list
        }))
    # Broadcast to all students
    for student_ws in main_room:
        await student_ws.send_text(json.dumps({
            "type": "STUDENT_LIST",
            "students": student_list
        }))

