# Voice Broadcasting SaaS Platform

A complete SaaS Voice Broadcasting platform that uses Infobip's voice API to send automated calls. The system can process up to 10 calls per minute and uses MongoDB for data storage.

## Features

### Admin Dashboard
- **User Insights**: Total users count, active user count, new user count
- **Campaign Reports**: Total campaign count, active campaign count, active calls count
- **Billing Reports**: Call rates cost from provider, platform call rates cost for users, profit for calls, today's total profits, all-time total profits
- **Call Statistics**: Answered calls count, failed calls count, in-progress count, busy count, no-answer count, transfer count, completed calls count

### User Features
- **Campaign Creation**: Step-by-step wizard to create voice broadcasting campaigns
- **Campaign Management**: View and manage existing campaigns
- **Caller ID Verification**: Add and verify caller IDs for campaigns
- **File Management**: Upload and manage audio files and contact lists
- **Blocklist Management**: Add and manage blocked words/numbers
- **Billing**: View payment history, add credit, and check call history
- **Settings**: Configure API keys, email settings, and user profile

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- Infobip account with voice API access

## Installation

### Local Development

1. Clone the repository
   ```
   git clone https://github.com/truesip/InfoBipSaaS.git
   cd InfoBipSaaS
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/voicebroadcast

   # JWT Secret
   JWT_SECRET=your_secure_jwt_secret_key
   JWT_EXPIRATION=7d

   # Infobip API Configuration
   INFOBIP_API_KEY=your_infobip_api_key
   INFOBIP_BASE_URL=https://api.infobip.com
   INFOBIP_CALLBACK_URL=http://localhost:3000/api/callbacks/voice

   # Email Configuration (if applicable)
   EMAIL_SERVICE=smtp.example.com
   EMAIL_USER=your_email@example.com
   EMAIL_PASSWORD=your_email_password

   # Call Rate Configuration
   PROVIDER_CALL_RATE=0.03
   PLATFORM_CALL_RATE=0.05
   CALLS_PER_MINUTE=10
   ```

4. Initialize the database with seed data
   ```
   npm run seed
   ```

5. Start the development server
   ```
   npm run dev
   ```

6. Access the application at `http://localhost:3000`

### Production Deployment

#### DigitalOcean Deployment

1. Create a DigitalOcean Droplet
   - Choose Ubuntu 22.04 LTS x64
   - Select a plan with at least 2GB RAM
   - Add your SSH keys

2. Connect to your Droplet
   ```
   ssh root@your_droplet_ip
   ```

3. Update system packages
   ```
   apt update && apt upgrade -y
   ```

4. Install required dependencies
   ```
   # Install Node.js and npm
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   apt install -y nodejs

   # Install MongoDB
   apt install -y gnupg
   wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
   echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
   apt update
   apt install -y mongodb-org
   systemctl start mongod
   systemctl enable mongod

   # Install Git
   apt install -y git

   # Install PM2 (process manager)
   npm install -g pm2
   ```

5. Clone the repository
   ```
   mkdir -p /var/www
   cd /var/www
   git clone https://github.com/truesip/InfoBipSaaS.git
   cd InfoBipSaaS
   ```

6. Configure environment variables
   ```
   # Create .env file
   nano .env
   ```

   Add the production environment variables (similar to the local development `.env` but with production values).

7. Install dependencies and seed the database
   ```
   npm install
   npm run seed
   ```

8. Set up Nginx as a reverse proxy
   ```
   # Install Nginx
   apt install -y nginx

   # Configure Nginx
   nano /etc/nginx/sites-available/voice-broadcast
   ```

   Add the following configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com www.your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   Enable the site and restart Nginx:
   ```
   ln -s /etc/nginx/sites-available/voice-broadcast /etc/nginx/sites-enabled/
   nginx -t
   systemctl restart nginx
   ```

9. Set up SSL with Let's Encrypt
   ```
   apt install -y certbot python3-certbot-nginx
   certbot --nginx -d your-domain.com -d www.your-domain.com
   ```

10. Start the application with PM2
    ```
    cd /var/www/voice-broadcast-saas
    pm2 start app.js --name "voice-broadcast"
    pm2 startup
    pm2 save
    ```

11. Set up firewall
    ```
    ufw allow ssh
    ufw allow http
    ufw allow https
    ufw enable
    ```

12. Access your application at `https://your-domain.com`

## Usage

### Admin Access
- URL: `http://localhost:3000` (local) or `https://your-domain.com` (production)
- Default admin credentials:
  - Email: admin@example.com
  - Password: admin123

### Creating a Campaign
1. Log in to the platform
2. Navigate to Campaigns > Create Campaign
3. Follow the step-by-step wizard:
   - Enter campaign name
   - Select a verified caller ID
   - Upload a CSV file with contacts
   - Create a text-to-speech script
   - Select a transfer key
4. Start the campaign

### Monitoring Campaigns
- View real-time statistics on the dashboard
- Check call statuses (answered, failed, busy, etc.)
- Monitor billing and profits

## API Documentation

### Authentication

```
POST /api/auth/login
```
Request body:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```
Response:
```json
{
  "token": "jwt_token_here",
  "user": {
    "_id": "user_id",
    "email": "user@example.com",
    "role": "user"
  }
}
```

### Campaigns

```
GET /api/campaigns
```
Headers:
```
Authorization: Bearer jwt_token_here
```
Response:
```json
{
  "campaigns": [
    {
      "_id": "campaign_id",
      "name": "Campaign Name",
      "status": "active",
      "callerId": "caller_id",
      "messageScript": "Hello, this is a test message.",
      "transferKey": "1",
      "createdAt": "2023-01-01T00:00:00.000Z"
    }
  ]
}
```

```
POST /api/campaigns
```
Headers:
```
Authorization: Bearer jwt_token_here
Content-Type: multipart/form-data
```
Form data:
```
name: Campaign Name
callerId: caller_id
contactFile: [CSV file]
messageScript: Hello, this is a test message.
transferKey: 1
```
Response:
```json
{
  "campaign": {
    "_id": "campaign_id",
    "name": "Campaign Name",
    "status": "active",
    "callerId": "caller_id",
    "messageScript": "Hello, this is a test message.",
    "transferKey": "1",
    "createdAt": "2023-01-01T00:00:00.000Z"
  }
}
```

## Project Structure

```
VoiceBroadcastSaaS/
├── src/
│   ├── models/         # MongoDB schemas
│   ├── routes/         # API routes
│   ├── public/         # Frontend assets
│   │   ├── css/        # Stylesheets
│   │   ├── js/         # JavaScript files
│   │   └── index.html  # Main HTML file
│   └── scripts/        # Utility scripts
├── app.js              # Main application file
├── package.json        # Dependencies and scripts
├── .env                # Environment variables
└── README.md           # Documentation
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Infobip](https://www.infobip.com/) for providing the voice API
- [MongoDB](https://www.mongodb.com/) for the database
- [Express](https://expressjs.com/) for the web framework
- [Bootstrap](https://getbootstrap.com/) for the frontend framework
