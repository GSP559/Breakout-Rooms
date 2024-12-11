import React, { useEffect, useState} from 'react';
import StudentModal from './StudentModal';
import './mainroom.css';


function MainRoom() {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [currentRoom, setCurrentRoom] = useState('main');
  const [recipient, setRecipient] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [students, setStudents] = useState([]);
  const [chatTarget, setChatTarget] = useState(null); // Target for private chat
  const [userId, setUserId] = useState('');

  const [instructor, setInstructor] = useState({
    userId: 'Instructor',
    messages: [],
    unreadCount: 0,
  });

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8000/ws/student');
    setWs(socket);

    socket.onopen = () => {
      console.log('Student connected to server');
    };

    socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        data = event.data;
      }

      if (data.type === 'ASSIGN_ID') {
        setUserId(data.userId);
      } else if (data.type === 'STUDENT_LIST') {
        const updatedStudents = data.students
          .filter((student) => student.userId !== userId) // Exclude self
          .map((student) => ({
            ...student,
            messages: [],
          }));
        setStudents(updatedStudents);
      } else if (data.type === 'ACK') {
        console.log(data.message); // Optionally log ACK messages to the console
        return;
      } else if (data.type === 'GLOBAL_BROADCAST') {
        const sender = data.from;
        setMessages((prev) => [...prev, `Global from ${sender}: ${data.content}`]);
        return;
      } 
      else if (data.type === 'MAIN_BROADCAST') {
        const sender = data.from
        setMessages((prev) => [...prev, `${sender}: ${data.content}`]);
      } else if (data.type === 'ROOM_CHANGE') {
        // The student has been moved to a new room
        setCurrentRoom(data.roomId);
        setMessages((prev) => [...prev, `You have been moved to room: ${data.roomId}`]);
      } else if (data.type === 'BREAKOUT_BROADCAST') {
        const sender = data.from
        setMessages((prev) => [...prev, `${sender}: ${data.content}`]);
      } else if (data.type === 'WHISPER') {
        const { from, content } = data;
        if (from === 'Instructor') {
          setInstructor((prev) => ({
            ...prev,
            messages: [...prev.messages, { from, content }],
            unreadCount: chatTarget === 'Instructor' ? 0 : prev.unreadCount + 1,
          }));
        } else {
          setStudents((prev) =>
            prev.map((student) =>
              student.userId === from
                ? {
                    ...student,
                    messages: [...student.messages, { from, content }],
                    unreadCount: chatTarget === from ? 0 : (student.unreadCount || 0) + 1,
                  }
                : student
            )
          );
        }
      } else if (data.type === 'ERROR') {
          const errorMessage = data.message || 'An unknown error occurred';
          setMessages((prev) => [...prev, `ERROR: ${errorMessage}`]); // Format and display errors
          return; 

          
      } 
      
      
      
      else {
        // Unknown message
        setMessages((prev) => [...prev, JSON.stringify(data)]);
      }
      
    };

    socket.onclose = () => {
      console.log('Student WebSocket closed');
    };

    return () => {
      socket.close();
    };
  }, []);

  const sendMessage = () => {
    if (ws && inputValue.trim() !== '') {
      if (recipient.trim() !== '') {
        // Send a whisper
        ws.send(JSON.stringify({ type: 'WHISPER', to: recipient, content: inputValue }));
       
      // If student is in main room
      } else if (currentRoom === 'main') {
        ws.send(JSON.stringify({ type: 'BROADCAST_MAIN', content: inputValue }));
      } else {
        // If in breakout room, you may define a different type, e.g. BROADCAST_BREAKOUT
        ws.send(JSON.stringify({ type: 'BROADCAST_BREAKOUT', content: inputValue, roomId: currentRoom }));
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
  };

  const requestBreakout = () => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'REQUEST_BREAKOUT' }));
    }
  };

  const requestHelp = () => {
    if (ws) {
      ws.send(JSON.stringify({ type: 'HELP_REQUEST' }));
      // Optionally, display a confirmation message
      setMessages((prev) => [...prev, 'Help request sent to instructor.']);
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
    style={{ position: 'relative', cursor: 'pointer', padding: '5px', borderBottom: '1px solid #ddd' }}
  >
    {instructor.userId}
    {instructor.unreadCount > 0 && (
      <span className="notification-badge">{instructor.unreadCount}</span>
    )}
  </div>

  <h3>Connected Students</h3>
  {students.length > 0 ? (
    <ul>
     {students
      .filter((student) => student.userId !== userId)  // Exclude current student
      .map((student) => (
        <li
          key={student.userId}
          className="student-item"
          onClick={() => handleOpenChat(student.userId)}
          style={{ position: 'relative' }}
        >
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
      <h1>Student - Current Room: {currentRoom}</h1>
      <div style={{ border: '1px solid #ccc', height: '200px', overflowY: 'auto', padding: '10px', marginBottom: '10px' }}>
        {messages.map((m, i) => <div key={i}>{m}</div>)}
      </div>
      <input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Type a message..."
      />
      <button onClick={sendMessage}>Send</button>

      <button onClick={requestBreakout} style={{ marginBottom: '10px' }}>
        Request Breakout Room
      </button>

      {/* Add the Request Help Button */}
      <button onClick={requestHelp} style={{ marginBottom: '10px' }}>
        Request Help
      </button>
    </div>
    {chatTarget && (
  <StudentModal
    show={showModal}
    onClose={handleCloseModal}
    chatTarget={chatTarget}
    students={students}
    instructor={instructor} // Pass instructor object
    onSendMessage={handleSendMessage}
  />
)}
    </div>
  );
}

export default MainRoom;
