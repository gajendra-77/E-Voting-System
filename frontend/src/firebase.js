// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// Here is the SDK you need for Authentication (OTP)
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB3ayILmAnaGUuIpYWSm36V_uizHMgDnOs",
  authDomain: "e-voting-project-praveen.firebaseapp.com",
  projectId: "e-voting-project-praveen",
  storageBucket: "e-voting-project-praveen.firebasestorage.app",
  messagingSenderId: "317046160961",
  appId: "1:317046160961:web:0a52c8f1ef32c790cd10c0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);

// This is the answer to your question:
// We export the 'auth' service so other files (like App.js) can use it.
export { auth };