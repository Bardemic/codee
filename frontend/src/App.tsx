import { BrowserRouter as Router, Routes, Route, Outlet } from 'react-router-dom';
import { AuthProvider } from './lib/useAuth';
import Login from './pages/Login/Login';
import Home from './pages/Home/Home';
import Sidebar from './components/Sidebar/Sidebar';
import Integrations from './pages/Integrations/Integrations';
import Environments from './pages/Environments/Environments';
import Workspace from './pages/Workspace/Workspace';
import Workers from './pages/Workers/Workers';
import Usage from './pages/Usage/Usage';
import Organization from './pages/Organization/Organization';
import './app.css';

function SidebarLayout() {
    return (
        <Sidebar>
            <Outlet />
        </Sidebar>
    );
}

function App() {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/" element={<SidebarLayout />}>
                        <Route index element={<Home />} />
                        <Route path="integrations" element={<Integrations />} />
                        <Route path="environments" element={<Environments />} />
                        <Route path="workers" element={<Workers />} />
                        <Route path="usage" element={<Usage />} />
                        <Route path="organization" element={<Organization />} />
                        <Route path="agent/:agentId" element={<Workspace />} />
                    </Route>
                    <Route path="login" element={<Login />} />
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;
