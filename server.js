const express = require('express');
const { Resend } = require('resend');
const bodyParser = require('body-parser');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// CORS configuration - Allow frontend to access backend
app.use((req, res, next) => {
    const allowedOrigins = [
        'http://localhost:3000',  // Local frontend development
        'https://vo.flashspace.co', 
        'https://virtual.flashspace.co', 
        'https://flashspace.co',
        'https://www.flashspace.co',
        'https://flashspace01-flash-space-google-ads.vercel.app'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize Google Sheets
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

async function appendToSheet(data) {
    try {
        console.log('📊 Starting Google Sheets save operation...');
        console.log('📋 Data received:', { name: data.name, email: data.email, city: data.city });
        
        // Check if Google Sheets is configured
        if (!process.env.GOOGLE_SHEETS_ID) {
            console.log('⚠️  GOOGLE_SHEETS_ID environment variable is missing');
            return { success: false, message: 'Google Sheets not configured (missing GOOGLE_SHEETS_ID)' };
        }
        
        console.log('✅ GOOGLE_SHEETS_ID found:', process.env.GOOGLE_SHEETS_ID);
        console.log('✅ GOOGLE_SHEET_NAME:', process.env.GOOGLE_SHEET_NAME || 'Sheet1!A:P');

        // Create auth client from service account
        let credentials;
        
        // Support both Base64 encoded (production) and JSON string (local)
        if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64) {
            console.log('🔑 Using Base64 encoded credentials (GOOGLE_SERVICE_ACCOUNT_KEY_BASE64)');
            try {
                const decoded = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf8');
                credentials = JSON.parse(decoded);
                console.log('✅ Base64 credentials decoded successfully');
                console.log('📧 Service account email:', credentials.client_email);
            } catch (decodeError) {
                console.error('❌ Failed to decode Base64 credentials:', decodeError.message);
                return { success: false, message: 'Failed to decode Base64 credentials', error: decodeError.message };
            }
        } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
            console.log('🔑 Using JSON credentials (GOOGLE_SERVICE_ACCOUNT_KEY)');
            try {
                credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
                console.log('✅ JSON credentials parsed successfully');
                console.log('📧 Service account email:', credentials.client_email);
            } catch (parseError) {
                console.error('❌ Failed to parse JSON credentials:', parseError.message);
                return { success: false, message: 'Failed to parse JSON credentials', error: parseError.message };
            }
        } else {
            console.log('❌ NO Google Service Account credentials found!');
            console.log('💡 Need either GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 or GOOGLE_SERVICE_ACCOUNT_KEY');
            return { success: false, message: 'Google Service Account not configured (no credentials found)' };
        }
        
        console.log('🔐 Creating Google Auth client...');
        const auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: SCOPES,
        });

        console.log('📊 Initializing Google Sheets API...');
        const sheets = google.sheets({ version: 'v4', auth });
        
        const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        
        // Prepare row data
        const values = [[
            timestamp,                          // Timestamp
            data.name || '',                    // Name
            data.email || '',                   // Email
            data.phone || '',                   // Phone
            data.city || '',                    // City
            data.company || '',                 // Company
            data.message || '',                 // Message
            data.utm?.utm_source || '',         // UTM Source
            data.utm?.utm_medium || '',         // UTM Medium
            data.utm?.utm_campaign || '',       // UTM Campaign
            data.utm?.utm_term || '',           // UTM Term
            data.utm?.utm_content || '',        // UTM Content
            data.utm?.gclid || '',              // GCLID
            data.utm?.referrer || '',           // Referrer
            data.utm?.landing_page || '',       // Landing Page
            `FS-${Date.now()}`                  // Lead ID
        ]];

        const resource = {
            values,
        };

        console.log('📝 Appending data to sheet:', process.env.GOOGLE_SHEET_NAME || 'Sheet1!A:P');
        console.log('📊 Row data:', values[0].slice(0, 5), '...(16 columns total)');
        
        const result = await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
            range: process.env.GOOGLE_SHEET_NAME || 'Sheet1!A:P',
            valueInputOption: 'RAW',
            resource,
        });

        console.log('✅ Data saved to Google Sheets successfully!');
        console.log(`📝 ${result.data.updates.updatedCells} cells updated`);
        console.log('📍 Updated range:', result.data.updates.updatedRange);
        
        return { success: true, result: result.data };
    } catch (error) {
        console.error('❌ Google Sheets Error Details:');
        console.error('   Error name:', error.name);
        console.error('   Error message:', error.message);
        console.error('   Error code:', error.code);
        
        if (error.response) {
            console.error('   API Response status:', error.response.status);
            console.error('   API Response data:', JSON.stringify(error.response.data, null, 2));
        }
        
        if (error.message.includes('Unable to parse range')) {
            console.error('💡 TIP: Check GOOGLE_SHEET_NAME format. Should be like: "SheetName!A:P"');
        }
        
        if (error.message.includes('Requested entity was not found')) {
            console.error('💡 TIP: Check if GOOGLE_SHEETS_ID is correct and sheet exists');
        }
        
        if (error.message.includes('does not have permission')) {
            console.error('💡 TIP: Share the Google Sheet with:', credentials?.client_email || 'service account email');
        }
        
        console.error('   Full error object:', error);
        return { success: false, error: error.message, details: error.code };
    }
}

// Email endpoint
app.post('/api/send-email', async (req, res) => {
    console.log('➡️  /api/send-email endpoint hit');
    
    const { 
        name, 
        email, 
        phone, 
        city, 
        company, 
        message, 
        utm, 
        timestamp, 
        user_agent 
    } = req.body;

    console.log('\n📬 New form submission received:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 Name:', name);
    console.log('📧 Email:', email);
    console.log('📱 Phone:', phone || 'Not provided');
    console.log('🏢 Company:', company || 'Not provided');
    console.log('📍 City:', city || 'Not provided');
    console.log('💬 Message:', `"${message || 'Not provided'}"`, 'Length:', (message || '').length);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 UTM TRACKING DATA:');
    if (utm) {
        console.log('  🔑 GCLID:', utm.gclid || '❌ NOT PROVIDED');
        console.log('  📱 Source:', utm.utm_source || '❌ NOT PROVIDED');
        console.log('  📢 Medium:', utm.utm_medium || '❌ NOT PROVIDED');
        console.log('  🎪 Campaign:', utm.utm_campaign || '❌ NOT PROVIDED');
        console.log('  🔍 Term:', utm.utm_term || '❌ NOT PROVIDED');
        console.log('  📝 Content:', utm.utm_content || '❌ NOT PROVIDED');
        console.log('  🔙 Referrer:', utm.referrer || 'Direct Visit');
        console.log('  🌐 Landing Page:', utm.landing_page || 'N/A');
    } else {
        console.log('  ⚠️ No UTM data received');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⏰ Timestamp:', timestamp);

    // Validation - message is optional
    if (!name || !email) {
        console.log('❌ Validation failed - missing required fields');
        return res.status(400).json({ 
            success: false, 
            message: 'Name and email are required' 
        });
    }

    // Check if API key exists
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_your_api_key_here') {
        console.log('❌ Resend API key not configured!');
        return res.status(500).json({ 
            success: false, 
            message: 'Email service not configured. Please contact administrator.' 
        });
    }

    console.log('✅ Validation passed, attempting to send email...');

    // Build UTM info for email
    const utmInfo = utm && Object.values(utm).some(val => val !== '') ? `
        <h3 style="color: #4A90E2; margin-top: 30px; padding-top: 20px; border-top: 2px solid #eee;">📊 Marketing Tracking Data</h3>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif;">
                <tr style="background: #e9ecef;">
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; font-weight: bold; color: #495057;">Campaign</td>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; color: #6c757d;">${utm.utm_campaign || 'Direct Visit'}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; font-weight: bold; color: #495057;">Source</td>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; color: #6c757d;">${utm.utm_source || 'Direct'}</td>
                </tr>
                <tr style="background: #e9ecef;">
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; font-weight: bold; color: #495057;">Medium</td>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; color: #6c757d;">${utm.utm_medium || 'None'}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; font-weight: bold; color: #495057;">Keyword</td>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; color: #6c757d;">${utm.utm_term || 'N/A'}</td>
                </tr>
                <tr style="background: #e9ecef;">
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; font-weight: bold; color: #495057;">Ad Content</td>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; color: #6c757d;">${utm.utm_content || 'N/A'}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; font-weight: bold; color: #495057;">Google Click ID</td>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; color: #6c757d; font-family: monospace; font-size: 12px;">${utm.gclid || 'N/A'}</td>
                </tr>
                <tr style="background: #e9ecef;">
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; font-weight: bold; color: #495057;">Landing Page</td>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; color: #6c757d; font-size: 12px; word-break: break-all;">${utm.landing_page || 'N/A'}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; font-weight: bold; color: #495057;">Referrer</td>
                    <td style="padding: 12px 15px; border: 1px solid #dee2e6; color: #6c757d; font-size: 12px;">${utm.referrer || 'Direct Visit'}</td>
                </tr>
            </table>
        </div>
    ` : `
        <h3 style="color: #6c757d; margin-top: 30px; padding-top: 20px; border-top: 2px solid #eee;">📊 Marketing Tracking</h3>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #6c757d; margin: 0;"><strong>Source:</strong> Direct Visit (No UTM parameters)</p>
        </div>
    `;
    
    // Calculate lead value based on campaign (optional)
    const campaignValue = utm?.utm_campaign ? 
        `<p style="background: #d4edda; color: #155724; padding: 10px; border-radius: 5px; margin: 10px 0;"><strong>💰 Estimated Lead Value:</strong> ₹2,500 (Based on campaign: ${utm.utm_campaign})</p>` : '';

    try {
        const { data, error } = await resend.emails.send({
            from: 'FlashSpace Virtual Office <onboarding@resend.dev>',
            to: ['sales@flashspace.co'],
            replyTo: email,
            subject: `🎯 New Lead: ${name} from ${utm?.utm_campaign || 'Direct Visit'} - ${city}`,
            html: `
                <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 50%, #FFA94D 100%); padding: 40px 30px; text-align: center; position: relative;">
                        <div style="background: rgba(255,255,255,0.15); padding: 20px; border-radius: 12px; backdrop-filter: blur(10px);">
                            <div style="font-size: 48px; margin-bottom: 10px;">⚡</div>
                            <h1 style="margin: 0; font-size: 32px; font-weight: 700; color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">New Virtual Office Lead!</h1>
                            <p style="margin: 12px 0 0 0; color: rgba(255,255,255,0.95); font-size: 16px; font-weight: 500;">FlashSpace Landing Page</p>
                        </div>
                    </div>
                    
                    <!-- Content -->
                    <div style="padding: 35px 30px;">
                        <!-- Quick Stats Banner -->
                        <div style="background: linear-gradient(135deg, #FFF4E6 0%, #FFE5CC 100%); border-radius: 12px; padding: 20px; margin-bottom: 30px; border-left: 4px solid #FF6B35;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="text-align: center; flex: 1;">
                                    <div style="font-size: 24px; font-weight: 700; color: #FF6B35;">🔥 HOT</div>
                                    <div style="font-size: 12px; color: #666; margin-top: 5px;">New Lead</div>
                                </div>
                                <div style="text-align: center; flex: 1; border-left: 2px solid #FFD4B3; border-right: 2px solid #FFD4B3;">
                                    <div style="font-size: 20px; font-weight: 700; color: #FF6B35;">${city}</div>
                                    <div style="font-size: 12px; color: #666; margin-top: 5px;">Location</div>
                                </div>
                                <div style="text-align: center; flex: 1;">
                                    <div style="font-size: 20px; font-weight: 700; color: #FF6B35;">${utm?.utm_source || 'Direct'}</div>
                                    <div style="font-size: 12px; color: #666; margin-top: 5px;">Source</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Contact Information -->
                        <div style="background: #ffffff; border: 2px solid #FFF0E5; border-radius: 12px; padding: 28px; margin-bottom: 25px; box-shadow: 0 4px 12px rgba(255,107,53,0.08);">
                            <div style="display: flex; align-items: center; margin-bottom: 22px;">
                                <div style="background: linear-gradient(135deg, #FF6B35, #FF8C42); width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-right: 15px;">
                                    <span style="font-size: 20px;">👤</span>
                                </div>
                                <h2 style="color: #2D3748; margin: 0; font-size: 22px; font-weight: 700;">Contact Details</h2>
                            </div>
                            
                            <div style="background: #FAFAFA; border-radius: 8px; padding: 20px;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 14px 0; border-bottom: 1px solid #E2E8F0; font-weight: 600; color: #4A5568; width: 35%;">
                                            <span style="color: #FF6B35; margin-right: 8px;">●</span>Full Name
                                        </td>
                                        <td style="padding: 14px 0; border-bottom: 1px solid #E2E8F0; color: #2D3748; font-weight: 500;">${name}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 14px 0; border-bottom: 1px solid #E2E8F0; font-weight: 600; color: #4A5568;">
                                            <span style="color: #FF6B35; margin-right: 8px;">●</span>Email
                                        </td>
                                        <td style="padding: 14px 0; border-bottom: 1px solid #E2E8F0;">
                                            <a href="mailto:${email}" style="color: #FF6B35; text-decoration: none; font-weight: 600;">${email}</a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 14px 0; border-bottom: 1px solid #E2E8F0; font-weight: 600; color: #4A5568;">
                                            <span style="color: #FF6B35; margin-right: 8px;">●</span>Phone
                                        </td>
                                        <td style="padding: 14px 0; border-bottom: 1px solid #E2E8F0;">
                                            <a href="tel:${phone}" style="color: #FF6B35; text-decoration: none; font-weight: 600; font-size: 16px;">${phone}</a>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 14px 0; border-bottom: 1px solid #E2E8F0; font-weight: 600; color: #4A5568;">
                                            <span style="color: #FF6B35; margin-right: 8px;">●</span>City
                                        </td>
                                        <td style="padding: 14px 0; border-bottom: 1px solid #E2E8F0; color: #2D3748; font-weight: 500;">${city}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 14px 0; border-bottom: 1px solid #E2E8F0; font-weight: 600; color: #4A5568;">
                                            <span style="color: #FF6B35; margin-right: 8px;">●</span>Company
                                        </td>
                                        <td style="padding: 14px 0; border-bottom: 1px solid #E2E8F0; color: #2D3748; font-weight: 500;">${company}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 14px 0; font-weight: 600; color: #4A5568;">
                                            <span style="color: #FF6B35; margin-right: 8px;">●</span>Submitted
                                        </td>
                                        <td style="padding: 14px 0; color: #718096; font-size: 14px;">${new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                        
                        ${message ? `
                        <!-- Message Section -->
                        <div style="background: linear-gradient(135deg, #E6F7FF 0%, #CCE7FF 100%); border-left: 5px solid #1890FF; border-radius: 12px; padding: 25px; margin: 25px 0; box-shadow: 0 3px 10px rgba(24,144,255,0.1);">
                            <div style="display: flex; align-items: center; margin-bottom: 15px;">
                                <span style="font-size: 24px; margin-right: 12px;">💬</span>
                                <h3 style="color: #1890FF; margin: 0; font-size: 18px; font-weight: 700;">Customer Message</h3>
                            </div>
                            <p style="margin: 0; color: #2D3748; line-height: 1.7; font-size: 15px; font-style: italic; background: white; padding: 18px; border-radius: 8px;">"${message}"</p>
                        </div>
                        ` : ''}
                        
                        ${campaignValue}
                        
                        <!-- Marketing Tracking Data -->
                        ${utmInfo}
                        
                        <!-- Action Items -->
                        <div style="background: linear-gradient(135deg, #FFF9E6 0%, #FFF3CC 100%); border: 2px solid #FFD666; border-radius: 12px; padding: 25px; margin-top: 30px;">
                            <div style="display: flex; align-items: center; margin-bottom: 18px;">
                                <div style="background: #FFB800; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                                    <span style="font-size: 20px;">⚡</span>
                                </div>
                                <h3 style="color: #B7791F; margin: 0; font-size: 20px; font-weight: 700;">Next Steps - Act Fast!</h3>
                            </div>
                            <div style="background: white; border-radius: 8px; padding: 20px;">
                                <ul style="margin: 0; padding-left: 24px; color: #6B5416; line-height: 2;">
                                    <li style="margin-bottom: 10px; font-weight: 500;"><strong style="color: #B7791F;">📞 Call within 30 minutes</strong> for best conversion rate</li>
                                    <li style="margin-bottom: 10px; font-weight: 500;"><strong style="color: #B7791F;">📧 Email follow-up</strong> with virtual office packages for ${city}</li>
                                    <li style="margin-bottom: 10px; font-weight: 500;"><strong style="color: #B7791F;">💰 Send pricing</strong> for ${city} virtual office locations</li>
                                    <li style="font-weight: 500;"><strong style="color: #B7791F;">📅 Schedule</strong> a video call to explain the process</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div style="background: linear-gradient(135deg, #2D3748 0%, #1A202C 100%); padding: 30px; text-align: center;">
                        <div style="margin-bottom: 15px;">
                            <div style="display: inline-block; background: rgba(255,107,53,0.15); padding: 12px 24px; border-radius: 25px; border: 2px solid #FF6B35;">
                                <span style="color: #FF6B35; font-size: 24px; font-weight: 700;">⚡ FlashSpace</span>
                            </div>
                        </div>
                        <p style="margin: 12px 0 5px 0; color: #A0AEC0; font-size: 14px; font-weight: 500;">New lead from FlashSpace Virtual Office Landing Page</p>
                        <p style="margin: 5px 0 15px 0; color: #718096; font-size: 13px;">Lead ID: <span style="color: #FF6B35; font-weight: 600;">FS-${Date.now()}</span></p>
                        <div style="border-top: 1px solid #4A5568; padding-top: 15px; margin-top: 15px;">
                            <p style="margin: 0; color: #718096; font-size: 12px;">Powered by FlashSpace Lead Generation System</p>
                        </div>
                    </div>
                </div>
            `
        });

        // Check for Resend API errors first
        if (error) {
            console.error('❌ Resend API Error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Failed to send email via Resend.',
                error: error.message || 'Unknown Resend error'
            });
        }

        console.log('✅ Email sent successfully!');
        console.log('Email ID:', data.id);
        
        // Save to Google Sheets
        console.log('🔄 Now attempting to save to Google Sheets...');
        const sheetResult = await appendToSheet(req.body);
        
        if (sheetResult.success) {
            console.log('✅ SUCCESS: Data saved to Google Sheets');
            console.log('📊 Cells updated:', sheetResult.result?.updates?.updatedCells || 'N/A');
        } else {
            console.error('❌ FAILED: Google Sheets update failed');
            console.error('📋 Reason:', sheetResult.message || sheetResult.error || 'Unknown error');
            console.error('🔍 Full error details:', JSON.stringify(sheetResult, null, 2));
        }
        
        console.log('---\n');
        
        res.json({ 
            success: true, 
            message: 'Email sent successfully! We will contact you soon.',
            emailId: data.id,
            leadId: `FS-${Date.now()}`,
            googleSheets: sheetResult.success,
            googleSheetsError: sheetResult.success ? null : (sheetResult.message || sheetResult.error)
        });
    } catch (error) {
        console.error('❌ Email sending error:');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Full error:', error);
        console.log('---\n');
        
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send email. Please try again later.',
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'FlashSpace Backend API is running',
        emailService: process.env.RESEND_API_KEY ? 'Resend configured ✅' : 'Not configured ❌',
        timestamp: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'FlashSpace Backend API',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            sendEmail: '/api/send-email'
        }
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n🚀 ========================================`);
    console.log(`✅ FlashSpace Backend API Server Running`);
    console.log(`========================================`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`📧 Email service: ${process.env.RESEND_API_KEY ? 'Resend Configured ✅' : 'NOT CONFIGURED ❌'}`);
    console.log(`========================================\n`);
    
    if (!process.env.RESEND_API_KEY) {
        console.log(`⚠️  WARNING: RESEND_API_KEY not set!`);
        console.log(`💡 Get your API key: https://resend.com/api-keys\n`);
    }
});
