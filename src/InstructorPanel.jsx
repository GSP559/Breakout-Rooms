import React, { useState, useEffect } from 'react';
import InstructorModal from './modal'; // Adjust the import based on your file structure

function InstructorPanel() {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState({});
  const [students, setStudents] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [chatTarget, setChatTarget] = useState(null);
  const [broadcastType, setBroadcastType] = useState('currentRoom');
  const [message, setMessage] = useState('');
  const [currentRoom, setCurrentRoom] = useState('main');
  const [activeBreakoutRooms, setActiveBreakoutRooms] = useState([]);
  const [privateMessagingEnabled, setPrivateMessagingEnabled] = useState(true);

  useEffect(() => {
    const socket = new WebSocket('ws://3.94.119.197:8000/ws/instructor');
    setWs(socket);

    socket.onopen = () => {
      console.log('Instructor connected to server');
    };

    socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.error('Failed to parse WebSocket message:', event.data);
        return;
      }

      if (data.type === 'ROOM_CHANGE') {
        setCurrentRoom(data.roomId);
      } else if (data.type === 'ACK') {
        const ackMessage = data.message || 'Acknowledgment received';
        setMessages((prevMessages) => {
          const roomMessages = prevMessages[currentRoom] || [];
          return {
            ...prevMessages,
            [currentRoom]: [...roomMessages, `System: ${ackMessage}`],
          };
        });
      } else if (data.type === 'PRIVATE_MESSAGING_STATUS') {
        setPrivateMessagingEnabled(data.enabled);
        setMessages((prevMessages) => {
          const roomMessages = prevMessages[currentRoom] || [];
          return {
            ...prevMessages,
            [currentRoom]: [
              ...roomMessages,
              `Private messaging ${data.enabled ? 'enabled' : 'disabled'}`,
            ],
          };
        });
      }  else if (data.type === 'STUDENT_LIST') {
        setStudents((prevStudents) => {
          const prevStudentMap = {};
          prevStudents.forEach((student) => {
            prevStudentMap[student.userId] = student;
          });
      
          const updatedStudents = data.students.map((student) => {
            const prevStudent = prevStudentMap[student.userId];
            return {
              ...student,
              messages: prevStudent?.messages || [],
              helpRequested: prevStudent?.helpRequested || false,
              breakoutRequested: prevStudent?.breakoutRequested || false,
              unreadCount: prevStudent?.unreadCount || 0,
            };
          });
          return updatedStudents;
        });
      } else if (data.type === 'ERROR') {
        const errorMessage = data.message || 'An unknown error occurred';
        setMessages((prevMessages) => {
          const roomMessages = prevMessages[currentRoom] || [];
          return {
            ...prevMessages,
            [currentRoom]: [...roomMessages, `ERROR: ${errorMessage}`],
          };
        });
      } else if (data.type === 'WHISPER') {
        const { from, content } = data;
        setStudents((prevStudents) => {
          const updatedStudents = prevStudents.map((student) =>
            student.userId === from
              ? {
                  ...student,
                  messages: [...student.messages, { from, content }],
                  unreadCount: chatTarget === from ? 0 : (student.unreadCount || 0) + 1,
                }
              : student
          );
          return updatedStudents;
        });
      } else if (data.type === 'MAIN_BROADCAST' || data.type === 'BREAKOUT_BROADCAST') {
        const sender = data.from;
        const roomId = data.roomId || 'main';
        const msg = `${sender}: ${data.content}`;
        setMessages((prevMessages) => {
          const roomMessages = prevMessages[roomId] || [];
          return {
            ...prevMessages,
            [roomId]: [...roomMessages, msg],
          };
        });
      } else if (data.type === 'GLOBAL_BROADCAST') {
        const sender = data.from;
        const msg = `Global from ${sender}: ${data.content}`;
        // Update messages for all rooms
        setMessages((prevMessages) => {
          const updatedMessages = { ...prevMessages };
          Object.keys(prevMessages).forEach((room) => {
            updatedMessages[room] = [...prevMessages[room], msg];
          });
          return updatedMessages;
        });
      } else if (data.type === 'BREAKOUT_REQUEST') {
        setMessages((prevMessages) => {
          const roomMessages = prevMessages[currentRoom] || [];
          return {
            ...prevMessages,
            [currentRoom]: [
              ...roomMessages,
              `Breakout request from: ${data.userId}`,
            ],
          };
        });
        setStudents((prevStudents) =>
          prevStudents.map((student) =>
            student.userId === data.userId
              ? { ...student, breakoutRequested: true }
              : student
          )
        );
      } else if (data.type === 'HELP_REQUEST') {
        setMessages((prevMessages) => {
          const roomMessages = prevMessages[currentRoom] || [];
          return {
            ...prevMessages,
            [currentRoom]: [...roomMessages, `Help request from: ${data.userId}`],
          };
        });
        setStudents((prevStudents) =>
          prevStudents.map((student) =>
            student.userId === data.userId
              ? { ...student, helpRequested: true }
              : student
          )
        );
      } else {
        console.log('Unknown message:', data);
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
      setActiveBreakoutRooms((prevRooms) => [...prevRooms, roomId]);
    }
  };

  const closeBreakoutRoom = () => {
    if (ws && roomId.trim() !== '') {
      ws.send(JSON.stringify({ type: 'JOIN_BREAKOUT', roomId: 'main' }));
      ws.send(JSON.stringify({ type: 'CLOSE_BREAKOUT', roomId }));
      setActiveBreakoutRooms((prevRooms) => prevRooms.filter((room) => room !== roomId));
    }
  };

  const moveStudentToBreakoutManual = () => {
    if (ws && targetUserId.trim() !== '' && roomId.trim() !== '') {
      ws.send(
        JSON.stringify({
          type: 'MOVE_TO_BREAKOUT',
          userId: targetUserId.trim(),
          roomId: roomId.trim(),
        })
      );
    }
  };

  const joinBreakoutRoom = (roomId) => {
    if (ws && roomId.trim() !== '') {
      ws.send(JSON.stringify({ type: 'JOIN_BREAKOUT', roomId }));
      setCurrentRoom(roomId);
    }
  };

  const handleStudentClick = (student) => {
    setShowModal(true);
    setChatTarget(student.userId);
    setStudents((prevStudents) =>
      prevStudents.map((s) =>
        s.userId === student.userId ? { ...s, unreadCount: 0 } : s
      )
    );
  };

  const handleSendMessage = (toUserId, content) => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'WHISPER', to: toUserId, content }));
      // Optionally update local chat history with the student
    }
  };

  const handleBroadcast = () => {
    if (ws && message.trim() !== '') {
      let messageType = '';

      switch (broadcastType) {
        case 'breakoutOnly':
          messageType = 'BROADCAST_BREAKOUT_ONLY';
          break;
        case 'main':
          messageType = 'BROADCAST_MAIN';
          break;
        case 'global':
          messageType = 'BROADCAST_ALL';
          break;
        case 'currentRoom':
        default:
          messageType = 'BROADCAST_CURRENT_ROOM';
          break;
      }

      ws.send(
        JSON.stringify({
          type: messageType,
          content: message,
          roomId: currentRoom,
        })
      );

      // Update local messages state
      const msg = `You (${broadcastType}): ${message}`;
      setMessages((prevMessages) => {
        const roomMessages = prevMessages[currentRoom] || [];
        return {
          ...prevMessages,
          [currentRoom]: [...roomMessages, msg],
        };
      });

      setMessage('');
    }
  };

  const togglePrivateMessaging = () => {
    if (ws) {
      const newStatus = !privateMessagingEnabled;
      ws.send(
        JSON.stringify({
          type: 'TOGGLE_PRIVATE_MESSAGING',
          enabled: newStatus,
        })
      );
      setPrivateMessagingEnabled(newStatus);
    }
  };

  const moveInstructorToMain = () => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'JOIN_BREAKOUT', roomId: 'main' }));
      setCurrentRoom('main');
    }
  };

  const handleCreatePrivateBreakout = (studentId) => {
    const newRoomId = `PrivateRoom-${studentId}`;
  
    // Create the breakout room
    if (ws && newRoomId.trim() !== '') {
      ws.send(JSON.stringify({ type: 'CREATE_BREAKOUT', roomId: newRoomId }));
    }
  
    // Move the student to the breakout room
    if (ws && studentId.trim() !== '') {
      ws.send(
        JSON.stringify({
          type: 'MOVE_TO_BREAKOUT',
          userId: studentId,
          roomId: newRoomId,
        })
      );
    }
  
    // Move the instructor to the new breakout room
    if (ws && newRoomId.trim() !== '') {
      ws.send(JSON.stringify({ type: 'JOIN_BREAKOUT', roomId: newRoomId }));
      setCurrentRoom(newRoomId);
    }
  
    // Reset the student's breakoutRequested flag
    setStudents((prevStudents) =>
      prevStudents.map((student) =>
        student.userId === studentId
          ? { ...student, breakoutRequested: false }
          : student
      )
    );
  
    // Update local state
    setActiveBreakoutRooms((prevRooms) => [...prevRooms, newRoomId]);
    setShowModal(false);
  };

  const handleJoinRoomHelp = (studentId) => {
    const student = students.find((s) => s.userId === studentId);
    const roomToJoin = student?.roomId;
    if (ws && roomToJoin) {
      ws.send(JSON.stringify({ type: 'JOIN_BREAKOUT', roomId: roomToJoin }));
      setCurrentRoom(roomToJoin);
      setShowModal(false);
  
      // Reset the student's helpRequested flag
      setStudents((prevStudents) =>
        prevStudents.map((student) =>
          student.userId === studentId
            ? { ...student, helpRequested: false }
            : student
        )
      );
    } else {
      console.error("Student's room not found.");
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
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {student.helpRequested && (
                  <span
                    role="img"
                    aria-label="help"
                    style={{ marginRight: '8px', position: 'absolute', left: '16px' }}
                  >
                    ✋
                  </span>
                )}
                {student.breakoutRequested && (
                  <span
                    role="img"
                    aria-label="breakout"
                    style={{
                      marginRight: student.helpRequested ? '24px' : '8px',
                      position: 'absolute',
                      left: student.helpRequested ? '36px' : '16px',
                    }}
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
          <button onClick={moveStudentToBreakoutManual}>Move Student to Breakout</button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <input
            placeholder="Breakout Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={() => joinBreakoutRoom(roomId)}>Join Breakout Room</button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <button onClick={moveInstructorToMain}>Move Instructor to Main Room</button>
        </div>

        {/* List of Active Breakout Rooms */}
        <div style={{ marginBottom: '20px' }}>
          <h2>Active Breakout Rooms</h2>
          <ul>
            {activeBreakoutRooms.map((room) => (
              <li key={room}>{room}</li>
            ))}
          </ul>
        </div>

        {/* Toggle Private Messaging */}
        <div style={{ marginBottom: '20px' }}>
          <button onClick={togglePrivateMessaging}>
            {privateMessagingEnabled ? 'Disable' : 'Enable'} Private Messaging
          </button>
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
            <label>
              <input
                type="radio"
                name="broadcastType"
                value="currentRoom"
                checked={broadcastType === 'currentRoom'}
                onChange={(e) => setBroadcastType(e.target.value)}
              />
              Current Room
            </label>
            <label style={{ marginLeft: '10px' }}>
              <input
                type="radio"
                name="broadcastType"
                value="main"
                checked={broadcastType === 'main'}
                onChange={(e) => setBroadcastType(e.target.value)}
              />
              Main
            </label>
            <label style={{ marginLeft: '10px' }}>
              <input
                type="radio"
                name="broadcastType"
                value="global"
                checked={broadcastType === 'global'}
                onChange={(e) => setBroadcastType(e.target.value)}
              />
              Global
            </label>
            <label style={{ marginLeft: '10px' }}>
    <input
      type="radio"
      name="broadcastType"
      value="breakoutOnly"
      checked={broadcastType === 'breakoutOnly'}
      onChange={(e) => setBroadcastType(e.target.value)}
    />
    Breakout Only
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
          {messages[currentRoom]?.map((m, i) => (
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
          instructor={{}} // If you have an instructor object
          onSendMessage={handleSendMessage}
          handleCreatePrivateBreakout={handleCreatePrivateBreakout}
          handleJoinRoomHelp={handleJoinRoomHelp}
        />
      )}
    </div>
  );
}

export default InstructorPanel;