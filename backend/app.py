# Filename: backend/app.py
# Registration with Voter ID + DOB + Mobile + Mock OTP + Face

import os
import uuid
import base64
import random
import re
from datetime import datetime, date
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from deepface import DeepFace
from blockchain import Blockchain
from liveness import check_liveness
from dotenv import load_dotenv, find_dotenv

# Ensure info logs are visible in the terminal
import logging

# try to load a .env file from the project root (or current working directory)
# the default load_dotenv() call will look for a file named ".env" next to
# the script being executed; ensure you place your file there rather than in
# the virtualenv folder.
load_dotenv(find_dotenv())

# 1. App Configuration
app = Flask(__name__)
# Ensure info-level logs show up in the terminal (Flask default may hide INFO)
logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)

# debug: very briefly log whether the Twilio SID was loaded (true/false)
app.logger.info("Twilio SID present? %s", bool(os.getenv('TWILIO_ACCOUNT_SID')))
CORS(app)
blockchain = Blockchain()
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///voting.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)


if not os.path.exists('temp_images'):
    os.makedirs('temp_images')

# Temporary storage for OTPs (demo-only; use Redis/DB in production)
otp_storage = {}

# 2. Database Models
class Voter(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    # Voter ID column
    voter_id = db.Column(db.String(12), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    image_path = db.Column(db.String(200), nullable=False)
    has_voted = db.Column(db.Boolean, default=False)
    mobile_number = db.Column(db.String(10), unique=True, nullable=False)
"""
class Vote(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.String(100), nullable=False)
"""

# Create database tables
with app.app_context():
    db.create_all()
def calculate_age(dob_str):
    try:
        dob = datetime.strptime(dob_str, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None

    today = date.today()
    years = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        years -= 1
    return years

# 4. API Routes
@app.route('/')
def index():
    return "E-Voting Backend is running!"

@app.route('/send-otp', methods=['POST'])
def send_otp():
    data = request.json
    voter_id = (data.get('voterId') or '').strip().upper()
    dob = data.get('dob')
    mobile_number = (data.get('mobileNumber') or '').strip()

    # Validate voter ID format: first 3 alphabets, next 7 numbers
    if not re.match(r'^[A-Z]{3}\d{7}$', voter_id):
        return jsonify({"error": "Voter ID must be in format ABC1234567 (3 letters followed by 7 digits)."}), 400

    if not mobile_number.isdigit() or len(mobile_number) != 10:
        return jsonify({"error": "Mobile number must be exactly 10 digits."}), 400

    age = calculate_age(dob)
    if age is None:
        return jsonify({"error": "Please select a valid date of birth."}), 400
    if age < 18:
        return jsonify({"error": "Voter must be 18 years or older to register."}), 403

    # Check if voter ID is already registered
    if Voter.query.filter_by(voter_id=voter_id).first():
        return jsonify({"error": "This voter ID is already registered."}), 409

    # Check if mobile number is already registered
    if Voter.query.filter_by(mobile_number=mobile_number).first():
        return jsonify({"error": "This mobile number is already registered."}), 409

    otp = str(random.randint(100000, 999999))

    otp_storage[voter_id] = {
        "otp": otp,
        "name": f"Voter-{voter_id[-4:]}",
        "dob": dob,
        "mobile_number": mobile_number
    }

    # For development: print OTP to terminal so the tester can copy/paste it.
    print(f"[OTP] Voter {voter_id} -> {otp}", flush=True)
    app.logger.info("Generated OTP for %s (OTP=%s)", voter_id, otp)

    return jsonify({
        "message": "OTP generated successfully!",
        "name": f"Voter-{voter_id[-4:]}",
        "otp": otp  # Include OTP in response for demo purposes
    }), 200

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    voter_id = (data.get('voterId') or '').strip().upper()
    otp = (data.get('otp') or '').strip()
    dob = data.get('dob')
    mobile_number = (data.get('mobileNumber') or '').strip()
    image_data_uri = data.get('imageData')

    # Validate voter ID format: first 3 alphabets, next 7 numbers
    if not re.match(r'^[A-Z]{3}\d{7}$', voter_id):
        return jsonify({"error": "Voter ID must be in format ABC1234567 (3 letters followed by 7 digits)."}), 400
    if not mobile_number.isdigit() or len(mobile_number) != 10:
        return jsonify({"error": "Mobile number must be exactly 10 digits."}), 400

    age = calculate_age(dob)
    if age is None:
        return jsonify({"error": "Please select a valid date of birth."}), 400
    if age < 18:
        return jsonify({"error": "Voter must be 18 years or older to register."}), 403

    if voter_id not in otp_storage or otp_storage[voter_id]['otp'] != otp:
        return jsonify({"error": "Invalid or expired OTP."}), 401

    otp_record = otp_storage[voter_id]
    if otp_record['dob'] != dob or otp_record['mobile_number'] != mobile_number:
        return jsonify({"error": "DOB or mobile number does not match OTP session."}), 400

    if Voter.query.filter_by(voter_id=voter_id).first():
        return jsonify({"error": "This voter ID is already registered."}), 409

    name = otp_record['name']


    temp_filename = None
    try:
        header, encoded = image_data_uri.split(",", 1)
        binary_data = base64.b64decode(encoded)
        temp_filename = f"temp_images/{uuid.uuid4()}.jpg"
        with open(temp_filename, 'wb') as f:
            f.write(binary_data)
        
        # use new API: extract_faces returns list of faces found
        faces = DeepFace.extract_faces(img_path=temp_filename, detector_backend='mtcnn')
        if not faces or len(faces) == 0:
            raise ValueError("no face returned by extract_faces")

    except Exception as e:
        app.logger.exception("error processing registration image")
        if temp_filename and os.path.exists(temp_filename):
            os.remove(temp_filename)
        return jsonify({"error": "No face detected or image is invalid."}), 400

    new_voter = Voter(
        voter_id=voter_id,
        name=name,
        image_path=temp_filename,
        mobile_number=mobile_number
    )
    db.session.add(new_voter)
    db.session.commit()

    del otp_storage[voter_id]

    return jsonify({"message": f"Voter '{name}' registered successfully!"}), 201

# --- /login Route (Unchanged Logic) ---
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    image_list = data.get('images')

    if not image_list or len(image_list) < 5:
        return jsonify({"error": "Insufficient frames for liveness detection."}), 400

    # 🔐 LIVENESS CHECK
    if not check_liveness(image_list):
        return jsonify({"error": "Liveness detection failed. Please turn your head left and right."}), 403

    # ✅ Continue face verification
    for voter in Voter.query.all():
        for img_data in image_list:
            temp_path = f"temp_images/live.jpg"
            header, encoded = img_data.split(",", 1)
            with open(temp_path, "wb") as f:
                f.write(base64.b64decode(encoded))

            try:
                result = DeepFace.verify(
                    img1_path=voter.image_path,
                    img2_path=temp_path,
                    model_name="Facenet",
                    enforce_detection=False
                )
                if result['verified']:
                    if voter.has_voted:
                        return jsonify({"error": "Already voted"}), 403

                    return jsonify({
                        "message": f"Welcome {voter.name}",
                        "voterName": voter.name,
                        "voterId": voter.voter_id
                    }), 200
            except:
                continue

    return jsonify({"error": "Face not recognized"}), 401


@app.route('/vote', methods=['POST'])
def vote():
    data = request.json
    voter_id = data.get('voterId')
    candidate_id = data.get('candidateId')

    if not voter_id or not candidate_id:
        return jsonify({"error": "Voter ID and Candidate ID are required."}), 400

    voter = Voter.query.filter_by(voter_id=voter_id).first()

    if not voter:
        return jsonify({"error": "Voter not found."}), 404

    if voter.has_voted:
        return jsonify({"error": "This voter has already cast their vote."}), 403

    voter.has_voted = True
    db.session.add(voter)
    db.session.commit()

    block_index = blockchain.add_vote(
        voter_id=voter.voter_id,
        candidate_id=candidate_id
    )

    last_block = blockchain.last_block
    last_hash = blockchain.hash(last_block)
    blockchain.create_block(proof=123, previous_hash=last_hash) # Using a dummy proof

    return jsonify({"message": "Successfully voted"}), 200
# --- NEW ADMIN/RESULTS ROUTES ---

@app.route('/admin/results', methods=['GET'])
def get_results():
    # This function will read the *entire* blockchain and tally the votes
    votes = {}

    # Iterate over every block in the chain (skip the first "Genesis Block")
    for block in blockchain.chain[1:]:
        for vote in block['votes']:
            candidate = vote['candidate']
            if candidate not in votes:
                votes[candidate] = 0
            votes[candidate] += 1

    return jsonify({
        "message": "Vote tally complete.",
        "results": votes
    }), 200

@app.route('/admin/chain', methods=['GET'])
def get_chain():
    # This lets an admin view the entire, raw blockchain
    return jsonify({
        "chain": blockchain.chain,
        "length": len(blockchain.chain)
    }), 200
# 5. Main execution block
if __name__ == '__main__':
    with app.app_context():
        # This creates the database and tables if they don't exist
        db.create_all()
    app.run(host='127.0.0.1', port=5000, debug=True)
