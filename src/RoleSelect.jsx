// RoleSelect.jsx
import React, { useState } from 'react';

function RoleSelect({ onRoleSelected }) {
  const [role, setRole] = useState('');

  const handleSubmit = () => {
    if (role) {
      onRoleSelected(role);
    } else {
      alert("Please select a role before proceeding.");
    }
  };

  return (
    <div style={styles.container}>
      <h2>Select Your Role</h2>
      <div style={styles.radioGroup}>
        <label style={styles.radioLabel}>
          <input
            type="radio"
            name="role"
            value="instructor"
            checked={role === 'instructor'}
            onChange={() => setRole('instructor')}
          />
          Instructor
        </label>
        <label style={styles.radioLabel}>
          <input
            type="radio"
            name="role"
            value="student"
            checked={role === 'student'}
            onChange={() => setRole('student')}
          />
          Student
        </label>
      </div>
      <button onClick={handleSubmit} style={styles.button}>
        Proceed
      </button>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex', 
    flexDirection: 'column',
    alignItems: 'center', 
    justifyContent: 'center', 
    height: '100vh', 
    background: '#f0f0f0'
  },
  radioGroup: {
    display: 'flex', 
    flexDirection: 'column', 
    marginBottom: '20px'
  },
  radioLabel: {
    margin: '10px 0'
  },
  button: {
    backgroundColor: '#4CAF50', 
    color: 'white', 
    border: 'none',
    padding: '10px 20px', 
    cursor: 'pointer', 
    fontSize: '16px'
  }
};

export default RoleSelect;
