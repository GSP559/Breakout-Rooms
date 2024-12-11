import React, { useEffect, useState } from 'react';
import InstructorModal from './modal.jsx'; // Import the Modal component

function InstructorPanel() {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [students, setStudents] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [showModal, setShowModal] = useState(false); // Control modal visibility
  const [selectedStudent, setSelectedStudent] = useState(null); // Track selected student
  const [chatTarget, setChatTarget] = useState(null);
  const [broadcastType, setBroadcastType] = useState('currentRoom'); // Default to 'main'
  const [message, setMessage] = useState('');
  const [currentRoom, setCurrentRoom] = useState('main'); // Track the current room

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8000/ws/instructor');
    setWs(socket);

    socket.onopen = () => {
      console.log('Instructor connected to server');
      // Optionally request initial student list or main room status
    };

    socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.error("Failed to parse WebSocket message:", event.data);
        return;
      }

      if (data.type === 'ROOM_CHANGE') {
        setCurrentRoom(data.roomId);
      }

      if (data.type === 'ACK') {
        const ackMessage = data.message || 'Acknowledgment received';
        setMessages((prev) => {
          const updatedMessages = [...prev, `System: ${ackMessage}`];
          console.log("Updated messages state:", updatedMessages);
          return updatedMessages;
        });
        return;
      } else if (data.type === 'STUDENT_LIST') {
        const updatedStudents = data.students.map((student) => ({
          ...student,
          messages: [], // Initialize messages for each student
          helpRequested: false, // Initialize helpRequested for each student
        }));
        setStudents(updatedStudents);
        return;
      } else if (data.type === 'ERROR') {
        const errorMessage = data.message || 'An unknown error occurred';
        setMessages((prev) => [...prev, `ERROR: ${errorMessage}`]); // Format and display errors
        return;
      } else if (data.type === 'WHISPER') {
        const { from, content } = data;

        setStudents((prevStudents) => {
          // Check if the student already exists in the list
          const studentExists = prevStudents.some((student) => student.userId === from);

          const updatedStudents = studentExists
            ? // Update the existing student
              prevStudents.map((student) =>
                student.userId === from
                  ? {
                      ...student,
                      messages: [...student.messages, { from, content }],
                      unreadCount: chatTarget === from ? 0 : (student.unreadCount || 0) + 1,
                    }
                  : student
              )
            : // Add the new student
              [
                ...prevStudents,
                {
                  userId: from,
                  messages: [{ from, content }],
                  unreadCount: chatTarget === from ? 0 : 1,
                  helpRequested: false, // Initialize helpRequested for new student
                },
              ];

          return updatedStudents;
        });
      } else if (data.type === 'MAIN_BROADCAST') {
        setMessages((prev) => [...prev, `Main: ${data.content}`]);
      } else if (data.type === 'GLOBAL_BROADCAST') {
        setMessages((prev) => [...prev, `Global: ${data.content}`]);
      } else if (data.type === 'BREAKOUT_BROADCAST') {
        const sender = data.from;
        setMessages((prev) => [...prev, `${sender}: ${data.content}`]);
      } else if (data.type === 'STUDENT_MESSAGE') {
        setMessages((prev) => [...prev, `${data.from}: ${data.content}`]);
      } else if (data.type === 'BREAKOUT_REQUEST') {
        // A student requested a breakout
        setMessages((prev) => [...prev, `Breakout request from: ${data.userId}`]);
        setStudents((prevStudents) =>
          prevStudents.map((student) =>
            student.userId === data.userId ? { ...student, breakoutRequested: true } : student
          )
        );
      } else if (data.type === 'HELP_REQUEST') {
        // A student requested help
        setMessages((prev) => [...prev, `Help request from: ${data.userId}`]);
        setStudents((prevStudents) =>
          prevStudents.map((student) =>
            student.userId === data.userId ? { ...student, helpRequested: true } : student
          )
        );
      } else {
        // Unknown message
        setMessages((prev) => [...prev, JSON.stringify(data)]);
      }
    };

    socket.onclose = () => {
      console.log('Instructor WebSocket closed');
    };

    return () => {
      socket.close();
    };
  }, []);

  const createMainRoom = () => {
    if (ws) ws.send(JSON.stringify({ type: 'CREATE_MAIN_ROOM' }));
  };

  const createBreakoutRoom = () => {
    if (ws && roomId.trim() !== '') {
      ws.send(JSON.stringify({ type: 'CREATE_BREAKOUT', roomId }));
    }
  };

  const moveStudentToBreakout = () => {
    if (ws && targetUserId.trim() !== '' && roomId.trim() !== '') {
      ws.send(JSON.stringify({ type: 'MOVE_TO_BREAKOUT', userId: targetUserId, roomId }));
    }
  };

  const closeBreakoutRoom = () => {
    if (ws && roomId.trim() !== '') {
      ws.send(JSON.stringify({ type: 'CLOSE_BREAKOUT', roomId }));
    }
  };

  const joinBreakoutRoom = (roomId) => {
    if (ws && roomId.trim() !== '') {
      ws.send(JSON.stringify({ type: 'JOIN_BREAKOUT', roomId }));
      setCurrentRoom(roomId); // Update the current room state
    }
  };

  const handleStudentClick = (student) => {
    console.log('Clicked student:', student.userId); // Debugging output

    setSelectedStudent(student); // Assign the clicked student
    setChatTarget(student.userId); // Set the chat target to the student's userId
    setShowModal(true); // Show the modal

    // Reset unreadCount and helpRequested for this student
    setStudents((prevStudents) =>
      prevStudents.map((s) =>
        s.userId === student.userId ? { ...s, unreadCount: 0, helpRequested: false ,breakoutRequested: false} : s
      )
    );
  };

  const handleSendMessage = (toUserId, content) => {
    if (ws && content.trim() !== '') {
      ws.send(
        JSON.stringify({
          type: 'WHISPER',
          to: toUserId,
          content,
        })
      );

      // Update the local state to show the sent message
      setStudents((prevStudents) =>
        prevStudents.map((student) =>
          student.userId === toUserId
            ? {
                ...student,
                messages: [...student.messages, { from: 'Me', content }],
              }
            : student
        )
      );
    }
  };

  const handleBroadcast = () => {
    if (ws && message.trim() !== '') {
      let messageType = '';
  
      // Determine the message type based on the selected broadcast type
      if (broadcastType === 'main') {
        messageType = 'BROADCAST_MAIN';
      } else if (broadcastType === 'global') {
        messageType = 'BROADCAST_ALL';
      } else if (broadcastType === 'breakout') {
        messageType = 'BREAKOUT_BROADCAST';
      } else if (broadcastType == 'currentRoom') {
        messageType = 'BROADCAST_CURRENT_ROOM';
      }
  
      // Send the message to the server
      ws.send(
        JSON.stringify({
          type: messageType,
          content: message,
          roomId: currentRoom, // Include the current room ID
        })
      );
  
      // Optionally, you can add the message to the local state or clear the input
      setMessages((prev) => [...prev, `You (${broadcastType}): ${message}`]);
      setMessage('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'row' }}>
      {/* Sidebar */}
      <div className="sidebar">
        <h3>Students</h3>
        {students.length > 0 ? (
          <ul>
            {students.map((student) => (
              <li
                key={student.userId}
                className="student-item"
                onClick={() => handleStudentClick(student)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center', // Aligns items vertically in the center
                  justifyContent: 'center', // Center the content horizontally
                }}
              >
                {student.helpRequested && (
                  <span
                    role="img"
                    aria-label="help"
                    style={{ marginRight: '8px', position: 'absolute', left: '16px' }} // Position the emoji to the left
                  >
                    ✋
                  </span>
                )}
                {student.breakoutRequested && (
                  <span
                    role="img"
                    aria-label="breakout"
                    style={{ marginRight: student.helpRequested ? '24px' : '8px', position: 'absolute', left: student.helpRequested ? '36px' : '16px' }} // Position the emoji to the left
                  >
                    👨‍💻
                  </span>
                )}
                {student.userId}
                {student.unreadCount > 0 && (
                  <span className="notification-badge">{student.unreadCount}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No students connected.</p>
        )}
      </div>

      <div style={{ padding: '20px' }}>
        <h1>Instructor Panel - Current Room: {currentRoom}</h1>

        <div style={{ marginBottom: '20px' }}>
          <button onClick={createMainRoom}>Create Main Room</button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <input
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={createBreakoutRoom}>Create Breakout Room</button>
          <button onClick={closeBreakoutRoom}>Close Breakout Room</button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <input
            placeholder="Student UserID"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
          />
          <button onClick={moveStudentToBreakout}>Move Student to Breakout</button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <input
            placeholder="Breakout Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={() => joinBreakoutRoom(roomId)}>Join Breakout Room</button>
        </div>

        {/* New Message Input and Broadcast Type Selection */}
        <div style={{ marginBottom: '20px' }}>
          <input
            placeholder="Enter your message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ width: '300px', marginRight: '10px' }}
          />

          {/* Broadcast Type Options */}
          <div>
          <label style={{ marginLeft: '10px' }}>
      <input
        type="checkbox"
        name='brodcastType'
        value='currentRoom'
        checked={broadcastType==='currentRoom'}
        onChange={(e) => setBroadcastType(e.target.value)}
      />
      Current Room
    </label>
            <label>
              <input
                type="checkbox"
                name="broadcastType"
                value="main"
                checked={broadcastType === 'main'}
                onChange={(e) => setBroadcastType(e.target.value)}
              />
              Main
            </label>
            <label style={{ marginLeft: '10px' }}>
              <input
                type="checkbox"
                name="broadcastType"
                value="global"
                checked={broadcastType === 'global'}
                onChange={(e) => setBroadcastType(e.target.value)}
              />
              Global
            </label>
            <label style={{ marginLeft: '10px' }}>
              <input
                type="checkbox"
                name="broadcastType"
                value="breakout"
                checked={broadcastType === 'breakout'}
                onChange={(e) => setBroadcastType(e.target.value)}
              />
              Breakout
              </label>
   
          </div>
          <button onClick={handleBroadcast} style={{ marginLeft: '10px' }}>
            Send Message
          </button>
        </div>

        <h2>Messages:</h2>
        <div
          style={{
            border: '1px solid #ccc',
            height: '200px',
            overflowY: 'auto',
            padding: '10px',
          }}
        >
          {messages.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      </div>
      {showModal && (
        <InstructorModal
          show={showModal}
          onClose={() => setShowModal(false)}
          chatTarget={chatTarget}
          students={students}
          onSendMessage={handleSendMessage}
        />
      )}
    </div>
  );
}

export default InstructorPanel;