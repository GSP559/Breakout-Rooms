import React, { useState } from 'react';
import './modal.css';

function InstructorModal({
  show,
  onClose,
  chatTarget,
  students,
  instructor,
  onSendMessage,
  handleCreatePrivateBreakout,
  handleJoinRoomHelp,
}) {
  const [message, setMessage] = useState('');
  const target =
    chatTarget === 'Instructor'
      ? instructor
      : students.find((s) => s.userId === chatTarget);

  if (!show || !target) return null;

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(chatTarget, message);
        target.messages.push({ from: 'Me', content: message });
      setMessage('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <div className="modal-header">
          <button
            className="modal-button"
            onClick={() => handleCreatePrivateBreakout(chatTarget)}
          >
            Create Private Breakout
          </button>
          <button
            className="modal-button"
            onClick={() => handleJoinRoomHelp(chatTarget)}
          >
            Help Student
          </button>
        </div>
        <h2 className="chat-title">Chat with {chatTarget}</h2>
        <div className="chat-display">
          {target.messages?.map((msg, idx) => (
            <div
              key={idx}
              className={`chat-message ${
                msg.from === 'Me' ? 'sent' : 'received'
              }`}
            >
              <strong>{msg.from}:</strong> {msg.content}
            </div>
          ))}
        </div>
        <div className="chat-input">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
          />
          <button onClick={handleSend}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default InstructorModal;