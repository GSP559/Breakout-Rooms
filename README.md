# Web-Based Breakout Rooms

## Project Overview
This project is a **Web-Based Classroom Management System** designed for real-time interaction between instructors and students. The system enables role-based functionalities, including chat, breakout room management, and status monitoring, using **React** for the frontend and **FastAPI** for the backend.

## Features
- **Instructor Role**:
  - Manage student connections.
  - Broadcast messages to the entire class or specific breakout rooms.
  - Create and manage breakout rooms.
  - Respond to help requests from students.
- **Student Role**:
  - Participate in the main room or assigned breakout rooms.
  - Send help requests to the instructor.
  - Communicate through private or public messages.
- **Real-Time Interaction**:
  - WebSocket-based communication for status updates, role-specific messaging, and room transitions.
- **Dynamic Role Selection**:
  - Users can choose to join as either an instructor or a student.

## Key Files
### Backend
#### `server.py`:
- Implements a FastAPI server with WebSocket endpoints for:
  - Managing instructor and student connections.
  - Handling chat messages and room transitions.
  - Broadcasting updates to clients.

### Frontend
#### `App.js`:
- Manages the role-based rendering of the application:
  - Displays role selection if no role is chosen.
  - Shows instructor or student-specific interfaces based on the selected role.
  
#### `RoleSelect.jsx`:
- Provides a UI for users to select their role (Instructor/Student).

#### `modal.jsx` and `StudentModal.jsx`:
- Modals for chat and room management:
  - Instructors can create breakout rooms and help students.
  - Students can chat with the instructor or peers in their room.

#### `index.js`:
- Entry point for the React application, rendering the `App` component.

## Dependencies
### Backend:
- Python Libraries:
  - `fastapi`
  - `uvicorn`
  - `json`
- Install dependencies using:
  ```bash
  pip install fastapi uvicorn
``
### Frontend:
  
