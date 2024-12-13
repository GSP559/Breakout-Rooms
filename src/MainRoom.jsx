import React, { useEffect, useState } from 'react';
import StudentModal from './StudentModal'; // Adjust the import based on your file structure
import './mainroom.css';

function MainRoom() {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState({});
  const [inputValue, setInputValue] = useState('');
  const [currentRoom, setCurrentRoom] = useState('main');
  const [recipient, setRecipient] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [students, setStudents] = useState([]);
  const [chatTarget, setChatTarget] = useState(null);
  const [userId, setUserId] = useState('');
  const [privateMessagingEnabled, setPrivateMessagingEnabled] = useState(true);
  const [breakoutRequested, setBreakoutRequested] = useState(false);
  const [helpRequested, setHelpRequested] = useState(false);
  const [usersInRoom, setUsersInRoom] = useState([]);

  const [instructor, setInstructor] = useState({
    userId: 'Instructor',
    messages: [],
    unreadCount: 0,
    roomId: 'main', // Assuming the instructor starts in the main room
  });

  useEffect(() => {
    const socket = new WebSocket('ws://3.94.119.197:8000/ws/student');
    setWs(socket);

    socket.onopen = () => {
      console.log('Student connected to server');
    };

    socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.error('Failed to parse WebSocket message:', event.data);
        return;
      }
      if (data.type === 'PRIVATE_MESSAGING_STATUS') {
        setPrivateMessagingEnabled(data.enabled);
      } else if (data.type === 'ASSIGN_ID') {
        setUserId(data.userId);
      } else if (data.type === 'ROOM_CHANGE') {
        console.log(`Room change to: ${data.roomId}`);
        setCurrentRoom(data.roomId);
        if (data.roomId === 'main') {
          setBreakoutRequested(false);
        }
      } else if (data.type === 'STUDENT_LIST') {
        const updatedStudents = data.students.map((student) => ({
          ...student,
          messages: [],
          unreadCount: 0,
        }));
        setStudents(updatedStudents);
      } else if (data.type === 'INSTRUCTOR_ROOM_CHANGE') {
        // Update the instructor's roomId
        setInstructor((prev) => ({
          ...prev,
          roomId: data.roomId,
        }));
        if (data.roomId !== currentRoom) {
          setHelpRequested(false);
        }
      } else if (
        data.type === 'MAIN_BROADCAST' ||
        data.type === 'BREAKOUT_BROADCAST' ||
        data.type === 'GLOBAL_BROADCAST' 
      ) {
        const sender = data.from;
        const roomId = data.roomId || 'main';
        const content = data.content;
        setMessages((prevMessages) => {
          const roomMessages = prevMessages[roomId] || [];
          return {
            ...prevMessages,
            [roomId]: [...roomMessages, { sender, content }],
          };
        });
        // Handle global messages separately
        if (data.type === 'GLOBAL_BROADCAST') {
          setMessages((prevMessages) => {
            const globalMessages = prevMessages['global'] || [];
            return {
              ...prevMessages,
              global: [...globalMessages, { sender, content }],
            };
          });
        }
      }
      else if (data.type === 'BREAKOUT_ONLY_BROADCAST') {
        console.log('Received breakout-only broadcast:', data);
        const sender = data.from;
        const content = data.content;
    
        if (currentRoom) {
            setMessages((prevMessages) => {
                const breakoutRoomMessages = prevMessages[currentRoom] || [];
                return {
                    ...prevMessages,
                    [currentRoom]: [...breakoutRoomMessages, { sender, content }],
                };
            });
        } else {
            // Queue the message if currentRoom isn't set
            setPendingMessages((prev) => [...prev, { sender, content }]);
        }
    }
    
    
         
      else if (data.type === 'WHISPER') {
        const { from, content } = data;
        if (from === 'Instructor') {
          setInstructor((prev) => ({
            ...prev,
            messages: [...prev.messages, { from, content }],
            unreadCount: chatTarget === 'Instructor' 
                     ? 0 : prev.unreadCount + 1,
          }));
        } else {
          setStudents((prev) =>
            prev.map((student) =>
              student.userId === from
                ? {
                    ...student,
                    messages: [...student.messages, { from, content }],
                    unreadCount:
                      chatTarget === from ? 0 : (student.unreadCount || 0) + 1,
                  }
                : student
            )
          );
        }
      } else if (data.type === 'ERROR') {
        const errorMessage = data.message || 'An unknown error occurred';
        setMessages((prevMessages) => {
          const roomMessages = prevMessages[currentRoom] || [];
          return {
            ...prevMessages,
            [currentRoom]: [...roomMessages, `ERROR: ${errorMessage}`],
          };
        });
      } else {
        console.log('Unknown message:', data);
      }
    };

    socket.onclose = () => {
      console.log('Student WebSocket closed');
    };

    return () => {
      socket.close();
    };
  }, []);

  const [pendingMessages, setPendingMessages] = useState([]);

  useEffect(() => {
      if (pendingMessages.length > 0 && currentRoom) {
          setMessages((prevMessages) => {
              const breakoutRoomMessages = prevMessages[currentRoom] || [];
              return {
                  ...prevMessages,
                  [currentRoom]: [...breakoutRoomMessages, ...pendingMessages],
              };
          });
          setPendingMessages([]); // Clear the queue
      }
  }, [currentRoom, pendingMessages]);
  
  useEffect(() => {
    const usersInCurrentRoom = students.filter(
      (student) => student.roomId === currentRoom
    );

    if (instructor.roomId === currentRoom) {
      usersInCurrentRoom.push(instructor);
    }

    setUsersInRoom(usersInCurrentRoom);
  }, [currentRoom, instructor.roomId, students]);

  const sendMessage = () => {
    if (ws && inputValue.trim() !== '') {
      if (recipient.trim() !== '') {
        // Send a whisper
        ws.send(JSON.stringify({ type: 'WHISPER', to: recipient, content: inputValue }));
      } else if (currentRoom === 'main') {
        ws.send(JSON.stringify({ type: 'BROADCAST_MAIN', content: inputValue }));
      } else {
        ws.send(JSON.stringify({ type: 'BROADCAST_BREAKOUT', content: inputValue }));
      }


      setInputValue('');
    }
  };

  const handleOpenChat = (targetId) => {
    if (targetId === 'Instructor') {
      setInstructor((prev) => ({ ...prev, unreadCount: 0 }));
    } else {
      setStudents((prev) =>
        prev.map((student) =>
          student.userId === targetId
            ? { ...student, unreadCount: 0 }
            : student
        )
      );
    }
    setChatTarget(targetId);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setChatTarget(null);
  };

  const handleSendMessage = (to, content) => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'WHISPER', to, content }));
      if (to === 'Instructor') {
        setInstructor((prev) => ({
          ...prev,
          messages: [...prev.messages, { from: 'Me', content }],
        }));
      } else {
        setStudents((prev) =>
          prev.map((student) =>
            student.userId === to
              ? {
                  ...student,
                  messages: [...student.messages, { from: 'Me', content }],
                }
              : student
          )
        );
      }
    }
  };

  const requestBreakout = () => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'REQUEST_BREAKOUT' }));
      setBreakoutRequested(true); // Disable the button after request
    }
  };

  const requestHelp = () => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'HELP_REQUEST' }));
      // Optionally, display a confirmation message
      setMessages((prevMessages) => {
        const roomMessages = prevMessages[currentRoom] || [];
        return {
          ...prevMessages,
          [currentRoom]: [
            ...roomMessages,
            { sender: 'System', content: 'Help request sent to instructor.' },
          ],
        };
      });
      setHelpRequested(true); // Disable the button after request
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'row' }}>
      {/* Sidebar */}
      <div className="sidebar">
        <h3>Instructor</h3>
        <div
          className="student-item"
          onClick={() => handleOpenChat('Instructor')}
          style={{
            position: 'relative',
            cursor: 'pointer',
            padding: '5px',
            borderBottom: '1px solid #ddd',
          }}
        >
          {instructor.userId}
          {instructor.unreadCount > 0 && (
            <span className="notification-badge">{instructor.unreadCount}</span>
          )}
        </div>
        {privateMessagingEnabled ? (
          <>
            <h3>Connected Students</h3>
            {students.length > 0 ? (
              <ul>
                {students
                  .filter((student) => student.userId !== userId)
                  .map((student) => (
                    <li
                      key={student.userId}
                      className="student-item"
                      onClick={() => handleOpenChat(student.userId)}
                      style={{ position: 'relative' }}
                    >
                      {student.userId}
                      {student.unreadCount > 0 && (
                        <span className="notification-badge">
                          {student.unreadCount}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            ) : (
              <p>No students connected.</p>
            )}
          </>
        ) : (
          <h3>Private messaging is disabled.</h3>
        )}
      </div>

      <div style={{ padding: '20px' }}>
        <h1>Student ({userId}) - Current Room: {currentRoom}</h1>


{/* List of Users in the Current Room */}
<div style={{ marginBottom: '10px' }}>
          <h3>Users in this room:</h3>
          <ul>
            {usersInRoom.map((user) => (
              <li key={user.userId}>{user.userId}</li>
            ))}
          </ul>
        </div>



        {/* Message Display Area */}
<div
  style={{
    border: '1px solid #ccc',
    height: '200px',
    overflowY: 'auto',
    padding: '10px',
    marginBottom: '10px',
  }}
>
  {messages[currentRoom]?.map((m, i) => {
    // Determine the display name
    let displayName = m.sender === userId ? 'You' : m.sender;
    return (
      <div key={i}>
        {displayName}: {m.content}
      </div>
    );
  })}
   {/* Display global messages */}
   {messages['global']?.map((m, i) => (
            <div key={i}>
              {m.sender}: {m.content}
            </div>
          ))}
           {/* Display global messages */}
   {messages['breakoutOnly']?.map((m, i) => (
            <div key={i}>
              {m.sender}: {m.content}
            </div>
          ))}
</div>
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type a message..."
          style={{ width: '300px', marginRight: '10px' }}
        />
        <button onClick={sendMessage}>Send</button>

        <div style={{ marginTop: '10px' }}>
        {currentRoom === 'main' && (
          <button
            onClick={requestBreakout}
            style={{ marginRight: '10px' }}
            disabled={breakoutRequested}
          >
            Request Breakout Room
          </button>
        )}
          {/* Conditionally render the Request Help button */}
          {currentRoom !== 'main' && instructor.roomId !== currentRoom && (
            <button onClick={requestHelp} disabled={helpRequested}>
              Request Help
            </button>
          )}
        </div>
      </div>
      {chatTarget && (
        <StudentModal
          show={showModal}
          onClose={handleCloseModal}
          chatTarget={chatTarget}
          students={students}
          instructor={instructor}
          onSendMessage={handleSendMessage}
        />
      )}
    </div>
  );
}

export default MainRoom;