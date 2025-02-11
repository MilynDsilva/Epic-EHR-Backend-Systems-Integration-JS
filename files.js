require('dotenv').config();
const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');

/* Read environment variables */
const CLIENT_ID = process.env.EPIC_CLIENT_ID;
const ISSUER = process.env.ISSUER;
const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH;
const PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
const PORT = process.env.PORT || 3001;

/* Epic endpoints */
const EPIC_TOKEN_URL = 'https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token';
const EPIC_FHIR_URL = 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4';

const app = express();
app.use(express.json());

/* Step 1: Generate a JWT for client assertion */
function generateJWT() {
    const payload = {
        iss: ISSUER,
        sub: CLIENT_ID,
        aud: EPIC_TOKEN_URL,
        exp: Math.floor(Date.now() / 1000) + 300,
        jti: Math.random().toString(36).substring(2)
    };
    return jwt.sign(payload, PRIVATE_KEY, { algorithm: 'RS256' });
}

/* Step 2: Get an OAuth 2.0 access token */
async function getAccessToken() {
    const jwtToken = generateJWT();
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    params.append('client_assertion', jwtToken);
    try {
        const response = await axios.post(EPIC_TOKEN_URL, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error fetching access token:', error.response?.data || error.message);
        throw error;
    }
}

/* Step 3: Initiate Bulk Data Export */
app.get('/bulk-export', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        const groupId = req.query.groupId || 'default-group-id';
        const resourceTypes = req.query.types || 'Patient,Observation,Encounter';
        const url = `${EPIC_FHIR_URL}/Group/${groupId}/$export?_type=${resourceTypes}`;

        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/fhir+json',
                Prefer: 'respond-async'
            }
        });

        res.json({
            success: true,
            message: 'Bulk data export initiated',
            statusUrl: response.headers['content-location']
        });
    } catch (error) {
        console.error('Error initiating bulk export:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Error initiating bulk export', error: error.message });
    }
});

/* Step 4: Check Export Status */
app.get('/bulk-status', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        const statusUrl = req.query.statusUrl;
        if (!statusUrl) return res.status(400).json({ success: false, message: 'Missing statusUrl parameter' });

        const response = await axios.get(statusUrl, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
        });

        res.json({ success: true, message: 'Export status retrieved', data: response.data });
    } catch (error) {
        console.error('Error checking export status:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Error checking export status', error: error.message });
    }
});

/* Step 5: Download Exported Data */
app.get('/bulk-download', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        const fileUrl = req.query.fileUrl;
        if (!fileUrl) return res.status(400).json({ success: false, message: 'Missing fileUrl parameter' });

        const response = await axios.get(fileUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'stream'
        });

        res.setHeader('Content-Disposition', `attachment; filename="bulk_data.ndjson"`);
        response.data.pipe(res);
    } catch (error) {
        console.error('Error downloading bulk data:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Error downloading bulk data', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
