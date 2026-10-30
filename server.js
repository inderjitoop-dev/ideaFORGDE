const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// MySQL Database Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',      // Aapka MySQL username
    password: '',  // Aapka MySQL password
    database: 'emergency_blood_network'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed: ' + err.stack);
        return;
    }
    console.log('Connected to MySQL Database successfully!');
});

// 1. API: Donor Registration with Auto-Eligibility Check
app.post('/api/register-donor', (req, res) => {
    const { name, blood_group, latitude, longitude, last_donation_date, phone } = req.body;

    // Eligibility Logic: Check if last donation was at least 90 days ago
    const lastDonation = new Date(last_donation_date);
    const today = new Date();
    const diffTime = Math.abs(today - lastDonation);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 90) {
        return res.status(400).json({ 
            success: false, 
            message: `You are not eligible yet. Only ${90 - diffDays} days remaining to complete the 90-day gap.` 
        });
    }

    // Insert into MySQL Database
    const query = `INSERT INTO donors (name, blood_group, latitude, longitude, last_donation_date, phone) VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.query(query, [name, blood_group, latitude, longitude, last_donation_date, phone], (err, result) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.status(201).json({ 
            success: true, 
            message: 'Donor registered successfully and eligibility verified!',
            donorId: result.insertId 
        });
    });
});

// Server Start
app.listen(5000, () => {
    console.log('Server is running on port 5000');
});
// 2. API: Find Nearest Donors using Haversine Formula
app.post('/api/request-blood', (req, res) => {
    const { patient_name, blood_group_needed, latitude, longitude } = req.body;

    // Haversine formula query to calculate distance in kilometers
    // 6371 is the Earth's radius in KM
    const query = `
        ID, name, phone, blood_group, latitude, longitude,
        ( 6371 * acos( cos( radians(?) ) * cos( radians( latitude ) ) * cos( radians( longitude ) - radians(?) ) + sin( radians(?) ) * sin( radians( latitude ) ) ) ) AS distance
        FROM donors
        WHERE blood_group = ? AND is_available = TRUE
        HAVING distance <= 50 -- Sirf 50 KM ke radius wale donors
        ORDER BY distance ASC -- Nearest first
        LIMIT 5;
    `;

    db.query(query, [latitude, longitude, latitude, blood_group_needed], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }

        // Privacy Protection: Mask phone numbers until request is accepted or sent
        const maskedResults = results.map(donor => ({
            ...donor,
            phone: donor.phone.slice(0, 2) + "******" + donor.phone.slice(-2) // Masking phone digits
        }));

        res.status(200).json({
            success: true,
            message: 'Nearest eligible donors found successfully!',
            nearestDonors: maskedResults
        });
    });
});
// 3. API: Get All Blood Bank Stocks
app.get('/api/blood-banks', (req, res) => {
    const query = `SELECT * FROM blood_banks`;
    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.status(200).json({ success: true, bloodBanks: results });
    });
});

// 4. API: Update or Insert Blood Bank Stock
app.post('/api/update-stock', (req, res) => {
    const { bank_name, blood_group, units_available, location_address } = req.body;

    // Check if record already exists for this bank and blood group
    const checkQuery = `SELECT * FROM blood_banks WHERE bank_name = ? AND blood_group = ?`;
    
    db.query(checkQuery, [bank_name, blood_group], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        if (results.length > 0) {
            // Update existing stock
            const updateQuery = `UPDATE blood_banks SET units_available = ?, location_address = ? WHERE bank_name = ? AND blood_group = ?`;
            db.query(updateQuery, [units_available, location_address, bank_name, blood_group], (err, result) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.status(200).json({ success: true, message: 'Blood stock updated successfully!' });
            });
        } else {
            // Insert new stock record
            const insertQuery = `INSERT INTO blood_banks (bank_name, blood_group, units_available, location_address) VALUES (?, ?, ?, ?)`;
            db.query(insertQuery, [bank_name, blood_group, units_available, location_address], (err, result) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.status(201).json({ success: true, message: 'Blood stock added successfully!' });
            });
        }
    });
});
