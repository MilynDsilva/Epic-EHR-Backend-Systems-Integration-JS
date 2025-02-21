require('dotenv').config();
const path = require('path');
const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');

/* Read environment variables */
const CLIENT_ID = process.env.CLIENT_ID;
const ISSUER = process.env.CLIENT_ID;
const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH;
const PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
const PORT = process.env.PORT || 3000;

/* Epic FHIR Endpoints */
const EPIC_TOKEN_URL = 'https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token';
const EPIC_FHIR_URL = 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4';

/*
   Step 1: Generate JWT for OAuth 2.0 authentication
*/
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

/*
   Step 2: Get an access token from Epic's OAuth server
*/
async function getAccessToken() {
    const jwtToken = generateJWT();

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    params.append('client_assertion', jwtToken);

    const response = await axios.post(EPIC_TOKEN_URL, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return response.data.access_token;
}

/*
   Middleware: Attach Access Token to Requests
*/
const authenticate = async (req, res, next) => {
    try {
        req.accessToken = await getAccessToken();
        next();
    } catch (error) {
        res.status(500).json({ success: false, message: 'Authentication failed', error: error.message });
    }
};

const app = express();
app.use(express.json());

/* 
    POST /upload-url - Store a document URL in Epic (DocumentReference API)
*/
app.post('/upload-url', authenticate, async (req, res) => {
    try {
        const { documentUrl, patientId, encounterId } = req.body;
        if (!documentUrl || !patientId) return res.status(400).json({ error: 'documentUrl and patientId are required' });

        // Step 1: Create DocumentReference with a URL (No File Content)
        const docReference = {
            resourceType: "DocumentReference",
            status: "current",
            type: {
                coding: [{
                    system: "http://loinc.org",
                    code: "11506-3",
                    display: "Scanned Document"
                }]
            },
            subject: { reference: `Patient/${patientId}` },
            date: new Date().toISOString(),
            content: [{
                attachment: {
                    contentType: "text/plain",
                    data: Buffer.from(documentUrl).toString('base64')
                }
            }]
        };


        if (encounterId) {
            docReference.context = { encounter: [{ reference: `Encounter/${encounterId}` }] };
        }

        // Step 2: Send API Request to Epic
        const docResponse = await axios.post(`${EPIC_FHIR_URL}/DocumentReference`, docReference, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${req.accessToken}`
            }
        });

        const locationHeader = docResponse.headers.location;
        const documentId = locationHeader ? locationHeader.split('/').pop() : null;

        if (!documentId) {
            return res.status(500).json({ success: false, message: "Epic did not return a Document ID" });
        }

        res.json({ success: true, documentId });

    } catch (error) {
        console.error("Epic API Error:", JSON.stringify(error.response?.data || error.message, null, 2));
        res.status(500).json({ success: false, message: "Error uploading document URL", error: error.response?.data || error.message });
    }
});

/* 
    GET /document/:documentId - Retrieve stored document URL from Epic
*/
app.get('/document/:documentId', authenticate, async (req, res) => {
    try {
        const { documentId } = req.params;

        // Step 1: Retrieve the DocumentReference
        const docResponse = await axios.get(`${EPIC_FHIR_URL}/DocumentReference/${documentId}`, {
            headers: { Authorization: `Bearer ${req.accessToken}` }
        });

        // Step 2: Extract Binary resource reference
        const attachments = docResponse.data.content || [];
        const binaryReference = attachments.length > 0 ? attachments[0].attachment.url : null;

        if (!binaryReference) {
            return res.status(404).json({ success: false, message: "No Binary reference found in DocumentReference" });
        }

        console.log("🔄 Fetching Binary data from:", `${EPIC_FHIR_URL}/${binaryReference}`);

        // Step 3: Fetch Binary resource from Epic
        const binaryResponse = await axios.get(`${EPIC_FHIR_URL}/${binaryReference}`, {
            headers: { Authorization: `Bearer ${req.accessToken}` }
        });

        // Step 4: Ensure `data` field exists
        if (!binaryResponse.data || !binaryResponse.data.data) {
            return res.status(500).json({
                success: false,
                message: "Binary resource does not contain data",
                epicResponse: binaryResponse.data
            });
        }

        // Step 5: Decode Base64 content (Epic stores URLs as Base64 text)
        const documentUrl = Buffer.from(binaryResponse.data.data, 'base64').toString('utf-8');

        res.json({ success: true, documentUrl });

    } catch (error) {
        console.error("Epic API Error:", JSON.stringify(error.response?.data || error.message, null, 2));
        res.status(500).json({
            success: false,
            message: "Error retrieving document",
            error: error.response?.data || error.message
        });
    }
});

/* Start the Express Server */
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
