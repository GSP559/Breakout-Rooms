// App.js
import React, { useState, useEffect } from 'react';
import RoleSelect from './RoleSelect';
import MainRoom from './MainRoom';
import InstructorPanel from './InstructorPanel';

function App() {
  const [role, setRole] = useState('');
  const [instructorConnected, setInstructorConnected] = useState(false);
  const [ws, setWs] = useState(null);

  useEffect(() => {
    // Connect to the server to listen for instructor status updates
    const socket = new WebSocket('ws://localhost:8000/ws/status');
    setWs(socket);

    socket.onopen = () => {
      console.log('Connected to status endpoint');
      // We might send a message to request the current instructor status if needed:
       socket.send(JSON.stringify({ type: "GET_INSTRUCTOR_STATUS" }));
    };

    socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        data = event.data;
      }

      if (data.type === 'INSTRUCTOR_STATUS') {
        setInstructorConnected(data.connected === true);
      }
    };

    socket.onclose = () => {
      console.log('Status WebSocket closed');
    };

    return () => {
      socket.close();
    };
  }, []);

  const handleRoleSelected = (selectedRole) => {
    setRole(selectedRole);
    // Note: Not storing in localStorage to enforce selection every time
  };

  // If no role selected, show role selection page
  if (!role) {
    return <RoleSelect onRoleSelected={handleRoleSelected} />;
  }

  // If instructor is chosen, show the instructor panel
  if (role === 'instructor') {
    return (
      <div>
        <InstructorPanel />
      </div>
    );
  }

  // If student is chosen:
  // Show waiting screen if instructor not connected
  if (role === 'student') {
    if (!instructorConnected) {
      return (
        <div style={{ padding: '20px' }}>
          <h1>Waiting for the instructor to connect...</h1>
        </div>
      );
    }
    // Once instructor is connected, show MainRoom
    return (
      <div>
        <MainRoom />
      </div>
    );
  }

  // Default fallback (should never hit this)
  return null;
}

export default App;
