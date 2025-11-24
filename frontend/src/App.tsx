import './App.css'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Outlet,
} from "react-router-dom";
import Login from './pages/Login/Login';
import Register from './pages/Register/Register';
import Home from './pages/Home/Home';
import Sidebar from './components/Sidebar/Sidebar';
import Integrations from './pages/Integrations/Integrations';
import Workspace from './pages/Workspace/Workspace';
import Workers from './pages/Workers/Workers';

function SidebarLayout() {
  return (
    <Sidebar>
      <Outlet />
    </Sidebar>
  )
}

function App() {
  
  return (
    <Router>
      <Routes>
        <Route path="/" element={<SidebarLayout />}>
          <Route index element={<Home />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="workers" element={<Workers />} />
          <Route path="workspace/:workspaceId" element={<Workspace />} />
        </Route>
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
      </Routes>
    </Router>
  )
}

export default App
