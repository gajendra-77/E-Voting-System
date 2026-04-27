# Filename: backend/blockchain.py
# New version with permanent file storage

import hashlib
import json
from time import time
import os  # --- NEW: Import OS to check if file exists ---

class Blockchain:
    def __init__(self):
        self.chain_file = "chain.json"  # --- NEW: Define the file name ---
        self.chain = []
        self.pending_votes = []
        
        # --- MODIFIED: Load the chain or create a new one ---
        self.load_chain()

    def load_chain(self):
        """Loads the blockchain from the chain.json file."""
        if os.path.exists(self.chain_file):
            try:
                with open(self.chain_file, 'r') as f:
                    self.chain = json.load(f)
                    if not self.chain:  # If file is empty
                        raise ValueError("Chain file is empty")
                print("Loaded blockchain from chain.json")
            except (json.JSONDecodeError, ValueError):
                print("chain.json is corrupt or empty, creating new chain.")
                self.chain = []
                self.create_block(previous_hash="1", proof=100) # Create Genesis Block
        else:
            print("No chain.json found, creating new chain with Genesis Block.")
            self.create_block(previous_hash="1", proof=100) # Create Genesis Block

    def save_chain(self):
        """Saves the current blockchain to chain.json."""
        with open(self.chain_file, 'w') as f:
            json.dump(self.chain, f, indent=4)
        print("Blockchain saved to chain.json")

    def create_block(self, proof, previous_hash):
        """
        Creates a new Block, adds it to the chain, and saves the chain.
        """
        block = {
            'index': len(self.chain) + 1,
            'timestamp': time(),
            'votes': self.pending_votes,
            'proof': proof,
            'previous_hash': previous_hash or self.hash(self.chain[-1]),
        }
        
        # Reset the list of pending votes
        self.pending_votes = []
        self.chain.append(block)
        
        # --- MODIFIED: Automatically save after creating a block ---
        self.save_chain()
        
        return block

    def add_vote(self, voter_id, candidate_id):
        """
        Adds a new vote to the list of pending_votes.
        This will be included in the next "mined" block.
        """
        self.pending_votes.append({
            'voter': voter_id,
            'candidate': candidate_id,
        })
        # Return the index of the block this vote will be added to
        return self.last_block['index'] + 1

    @staticmethod
    def hash(block):
        """
        Creates a SHA-256 hash of a Block
        """
        # We must make sure that the Dictionary is Ordered, or we'll have inconsistent hashes
        block_string = json.dumps(block, sort_keys=True).encode()
        return hashlib.sha256(block_string).hexdigest()

    @property
    def last_block(self):
        # Returns the last Block in the chain
        return self.chain[-1]