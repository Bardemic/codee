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
        </Route>
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
      </Routes>
    </Router>
  )
}

export default App
