// Filename: frontend/src/App.js
// Registration with Voter ID + DOB + Mobile + Mock OTP + Face

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import './App.css';

const apiUrl = 'http://127.0.0.1:5000';

function App() {
  const [view, setView] = useState(() => localStorage.getItem('currentView') || 'home');
  const [loggedInVoter, setLoggedInVoter] = useState(null);
  const [results, setResults] = useState({});

  const [voterId, setVoterId] = useState('');
  const [dob, setDob] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [userName, setUserName] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);

  const [message, setMessage] = useState({ text: '', type: '' });
  const [topNotice, setTopNotice] = useState({ text: '', type: '' });
  const webcamRef = useRef(null);
  const capture = useCallback(() => webcamRef.current.getScreenshot(), [webcamRef]);

  // Save current view to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('currentView', view);
  }, [view]);

  // Fetch results when view is results
  useEffect(() => {
    if (view === 'results') {
      fetchResults();
    }
  }, [view]);

  const fetchResults = async () => {
    try {
      const response = await fetch(`${apiUrl}/admin/results`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.results);
      } else {
        showMessage('Failed to fetch results.', 'error');
      }
    } catch (err) {
      showMessage('Error fetching results.', 'error');
    }
  };

  const captureFrames = async () => {
    const frames = [];

    // Optimized for faster login: 6 frames with 150ms gap -> ~0.9s total
    for (let i = 0; i < 6; i++) {
      const image = webcamRef.current?.getScreenshot();
      if (image) frames.push(image);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    return frames;
  };

  const showMessage = (text, type) => setMessage({ text, type });
  const showTopNotice = (text, type) => setTopNotice({ text, type });

  // Clear registration form data only (used on page refresh while staying on register page)
  const clearRegistrationForm = () => {
    setMessage({ text: '', type: '' });
    setTopNotice({ text: '', type: '' });
    setVoterId('');
    setDob('');
    setMobileNumber('');
    setUserName('');
    setOtp('');
    setDemoOtp('');
    setShowOtpInput(false);
  };

  // Change view and clear all form data (used for navigation between different pages)
  const changeView = (newView) => {
    clearRegistrationForm();
    setView(newView);
  };

  const getAgeFromDob = (dobValue) => {
    if (!dobValue) return null;
    const birthDate = new Date(dobValue);
    const today = new Date();

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }

    return age;
  };

  const validateRegistrationDetails = () => {
    const normalizedVoterId = voterId.trim().toUpperCase();
    if (!/^[A-Z]{3}\d{7}$/.test(normalizedVoterId)) {
      showMessage('Voter ID must be in format ABC1234567 (3 letters followed by 7 digits).', 'error');
      return false;
    }

    if (!/^\d{10}$/.test(mobileNumber.trim())) {
      showMessage('Mobile number must be exactly 10 digits.', 'error');
      return false;
    }

    const age = getAgeFromDob(dob);
    if (age === null || Number.isNaN(age)) {
      showMessage('Please select a valid date of birth.', 'error');
      return false;
    }

    if (age < 18) {
      showMessage('Voter must be 18 years or older to register.', 'error');
      return false;
    }

    return true;
  };

  const handleSendOtp = async () => {
    if (!validateRegistrationDetails()) return;

    showMessage('Validating details and generating OTP...', 'info');

    try {
      const response = await fetch(`${apiUrl}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterId: voterId.trim().toUpperCase(),
          dob,
          mobileNumber: mobileNumber.trim(),
        }),
      });

      const result = await response.json();

      if (response.status === 200) {
        setUserName(result.name);
        setVoterId(voterId.trim().toUpperCase());
        setMobileNumber(mobileNumber.trim());
        setDemoOtp(result.otp);  // Added this line
        setShowOtpInput(true);
        showMessage(`OTP generated for ${result.name}!`, 'success');
      } else {
        showMessage(`Error: ${result.error}`, 'error');
      }
    } catch (err) {
      showMessage('Failed to connect to the server.', 'error');
    }
  };

  const handleVerifyAndRegister = async (event) => {
    event.preventDefault();

    if (!validateRegistrationDetails()) return;

    if (!/^\d{6}$/.test(otp.trim())) {
      showMessage('Please enter the 6-digit OTP.', 'error');
      return;
    }

    showMessage('Verifying OTP and registering...', 'info');

    try {
      const imageData = capture();
      if (!imageData) {
        showMessage('Could not capture image.', 'error');
        return;
      }

      const response = await fetch(`${apiUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterId: voterId.trim().toUpperCase(),
          dob,
          mobileNumber: mobileNumber.trim(),
          otp: otp.trim(),
          imageData,
        }),
      });

      const result = await response.json();

      if (response.status === 201) {
        showMessage(`${result.message} You can now login.`, 'success');
        changeView('login');
      } else {
        showMessage(`Error: ${result.error}`, 'error');
      }
    } catch (err) {
      showMessage('Failed to register. (Server error)', 'error');
    }
  };

  const handleLogin = async () => {
    // show a top (non-modal) instruction for liveness
    showTopNotice('Please turn your head left and right', 'info');

    const images = await captureFrames();

    if (!images || images.length < 5) {
      setTopNotice({ text: '', type: '' });
      showMessage('Failed to capture enough frames', 'error');
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      });

      const result = await response.json();

      if (response.status === 200) {
        setTopNotice({ text: '', type: '' });
        showMessage(result.message, 'success');
        setLoggedInVoter({
          voterName: result.voterName,
          voterId: result.voterId,
        });
        setView('voting');
      } else {
        setTopNotice({ text: '', type: '' });
        showMessage(`Error: ${result.error}`, 'error');
      }
    } catch (err) {
      setTopNotice({ text: '', type: '' });
      showMessage('Server connection failed', 'error');
    }
  };

  const handleVote = async (candidate) => {
    showMessage(`Casting your vote for ${candidate}...`, 'info');
    try {
      const response = await fetch(`${apiUrl}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterId: loggedInVoter.voterId,
          candidateId: candidate,
        }),
      });
      const result = await response.json();
      if (response.status === 200) {
        showMessage(result.message, 'success');
        setTimeout(() => {
          setView('home');
          setLoggedInVoter(null);
        }, 3000);
      } else {
        showMessage(`Error: ${result.error}`, 'error');
      }
    } catch (err) {
      showMessage('Error: Failed to connect to the server.', 'error');
    }
  };

  const renderHomeView = () => (
    <div className="page-container home-page">
      <h2>Welcome to the Secure E-Voting System</h2>
      <p className="subtitle">Your voice, secured by technology. This system uses voter ID, OTP verification, and facial recognition.</p>

      <div className="process-steps">
        <div className="step-card">
          <h3>Step 1: Register</h3>
          <p>Go to the Register page, enter your 10-character voter ID, date of birth, and mobile number. Verify your mobile with the Demo OTP shown on the screen.</p>
        </div>
        <div className="step-card">
          <h3>Step 2: Verify</h3>
          <p>Enter the OTP shown on the screen and capture your face to complete your secure registration.</p>
        </div>
        <div className="step-card">
          <h3>Step 3: Vote</h3>
          <p>Login using your face. Once authenticated, cast your vote.</p>
        </div>
      </div>
      <div className="home-cta">
        <h3>Meet the Candidates</h3>
        <p>Learn about the candidates running in this election before you cast your vote.</p>
        <button className="button-primary" onClick={() => changeView('candidates')}>View Candidates</button>
      </div>
    </div>
  );

  const renderRegisterView = () => (
    <div className="page-container">
      <h2>Voter Registration</h2>
      <p>Enter your voter details, verify OTP, and register your face.</p>

      <div className="registration-layout">
        <div className="webcam-container">
          <h3>Live Camera Feed</h3>
          <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" width={480} height={360} />
        </div>

        <form onSubmit={handleVerifyAndRegister} className="form-container">
          <h3>Register Your Details</h3>

          <input
            type="text"
            value={voterId}
            onChange={(e) => setVoterId(e.target.value.toUpperCase())}
            placeholder="Enter 10-character voter ID"
            minLength={10}
            maxLength={10}
            required
            disabled={showOtpInput}
          />
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            required
            disabled={showOtpInput}
          />
          <input
            type="tel"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="Enter 10-digit mobile number"
            pattern="\d{10}"
            minLength={10}
            maxLength={10}
            required
            disabled={showOtpInput}
          />

          {!showOtpInput ? (
            <button type="button" className="button-primary" onClick={handleSendOtp}>Send OTP</button>
          ) : (
            <>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                minLength={6}
                maxLength={6}
                required
              />
              <button type="submit" className="button-primary">Verify & Register Face</button>
            </>
          )}
        </form>
      </div>
    </div>
  );

  const renderLoginView = () => (
    <div className="page-container">
      <h2>Voter Authentication</h2>
      <p>Please use your face to log in and cast your vote.</p>
      <div className="webcam-container" style={{ alignItems: 'center' }}>
        <h3>Login with Your Face</h3>
        <p className="instruction">Please turn your head left and right</p>

        <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" width={480} height={360} />
        <button className="button-primary login-button" onClick={handleLogin}>Authenticate</button>
      </div>
    </div>
  );

  const renderVoteBallotView = () => (
    <div className="page-container voting-container">
      <h2>Welcome, {loggedInVoter.voterName}!</h2>
      <p>Please cast your vote.</p>
      <div className="candidates">
        <div className="candidate-card" onClick={() => handleVote('Candidate A')}>
          <h3>Candidate A</h3>
          <p>Party of Unity</p>
        </div>
        <div className="candidate-card" onClick={() => handleVote('Candidate B')}>
          <h3>Candidate B</h3>
          <p>Party of Progress</p>
        </div>
        <div className="candidate-card" onClick={() => handleVote('Candidate C')}>
          <h3>Candidate C</h3>
          <p>Party of Innovation</p>
        </div>
      </div>
    </div>
  );

  const renderCandidatesView = () => (
    <div className="page-container">
      <h2>Meet the Candidates</h2>
      <p>Here are the official candidates for the election.</p>
      <div className="candidates" style={{ marginTop: '20px' }}>
        <div className="candidate-card static">
          <h3>Candidate A</h3>
          <p>Party of Unity</p>
          <p className="candidate-bio">"I believe in working together to build a stronger campus community."</p>
        </div>
        <div className="candidate-card static">
          <h3>Candidate B</h3>
          <p>Party of Progress</p>
          <p className="candidate-bio">"My focus is on modernization, technology, and future-ready skills."</p>
        </div>
        <div className="candidate-card static">
          <h3>Candidate C</h3>
          <p>Party of Innovation</p>
          <p className="candidate-bio">"Let's bring new ideas to the table and solve old problems."</p>
        </div>
      </div>
    </div>
  );

  const renderResultsView = () => (
    <div className="page-container">
      <h2>Election Results</h2>
      <p>Total votes casted for each candidate:</p>
      <div className="results-container">
        {Object.keys(results).length > 0 ? (
          Object.entries(results).map(([candidate, votes]) => (
            <div key={candidate} className="result-card">
              <h3>{candidate}</h3>
              <p className="vote-count">{votes} votes</p>
            </div>
          ))
        ) : (
          <p>Loading results...</p>
        )}
      </div>
    </div>
  );

  const renderContactView = () => (
    <div className="page-container contact-page">
      <h2>Contact Us</h2>
      <p>Have questions or need assistance with the voting process?</p>
      <p>Please reach out to the election committee.</p>
      <div className="contact-info">
        <p><strong>Email:</strong>2022csm.r328@svce.edu.in</p>
        <p><strong>Phone:</strong> +91-817979478*</p>
        <p><strong>Office:</strong> Room 102, Admin Building, SV College of Engineering, Tirupati</p>
      </div>
    </div>
  );

  return (
    <div className="App">
      <nav className="navbar">
        <div className="nav-brand">
          Secure E-Voting System
        </div>
        <div className="nav-links">
          <button className={`nav-button ${view === 'home' ? 'active' : ''}`} onClick={() => changeView('home')}>Home</button>
          <button className={`nav-button ${view === 'register' ? 'active' : ''}`} onClick={() => changeView('register')}>Register</button>
          <button className={`nav-button ${view === 'login' ? 'active' : ''}`} onClick={() => changeView('login')}>Login</button>
          <button className={`nav-button ${view === 'candidates' ? 'active' : ''}`} onClick={() => changeView('candidates')}>Candidates</button>
          <button className={`nav-button ${view === 'results' ? 'active' : ''}`} onClick={() => changeView('results')}>Results</button>
          <button className={`nav-button ${view === 'contact' ? 'active' : ''}`} onClick={() => changeView('contact')}>Contact Us</button>
        </div>
      </nav>

      <main className="main-content">
        {topNotice.text && (
          <div className={`top-notice ${topNotice.type}`} role="status" aria-live="polite">
            {topNotice.text}
          </div>
        )}
        {message.text && (
          <div className={`modal-overlay ${message.type}`} role="dialog" aria-live="assertive">
            <div className="modal-box">
              <h3>{message.type === 'error' ? 'Error' : message.type === 'success' ? 'Success' : 'Notice'}</h3>
              <p>{message.text}</p>
              <div className="modal-actions">
               
                <button className="modal-close primary" onClick={() => setMessage({ text: '', type: '' })}>OK</button>
              </div>
            </div>
          </div>
        )}
        {showOtpInput && demoOtp && (
          <div className="demo-otp-container">
            <div className="demo-otp-label">Demo OTP:</div>
            <div className="demo-otp-value">{demoOtp}</div>
          </div>
        )}
        {view === 'home' && renderHomeView()}
        {view === 'register' && renderRegisterView()}
        {view === 'login' && renderLoginView()}
        {view === 'voting' && renderVoteBallotView()}
        {view === 'candidates' && renderCandidatesView()}
        {view === 'results' && renderResultsView()}
        {view === 'contact' && renderContactView()}
      </main>

      <footer className="footer">
        <p>&copy; Sri Venkateswara College of Engineering, Tirupati, Andhra Pradesh. Final Year Project.</p>
      </footer>
    </div>
  );
}

export default App;
