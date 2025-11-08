import './App.css'
import { RepositoriesPill } from './features/repositories/RepositoriesPill'

function App() {
  return (
    <>
    <div>
      <div className='text-area-container'>
        <textarea className='new-message' placeholder='Find all errors from the recent commit and fix them' name="prompt" id="6-7" />
        <RepositoriesPill />
      </div>
    </div>
    </>
  )
}

export default App
