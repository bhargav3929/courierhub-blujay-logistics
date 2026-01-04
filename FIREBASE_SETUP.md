# Firebase Setup Guide for CourierHub Admin Dashboard

This guide will help you set up Firebase for the CourierHub admin dashboard.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard:
   - Enter project name: "CourierHub" (or your preferred name)
   - Enable Google Analytics (optional)
   - Create project

## Step 2: Register Your Web App

1. In the Firebase project dashboard, click the **Web icon** (`</>`) to add a web app
2. Register app:
   - App nickname: "CourierHub Admin"
   - Check "Also set up Firebase Hosting" (optional)
   - Click "Register app"
3. **Copy the Firebase configuration object** - you'll need this in the next step

## Step 3: Configure Environment Variables

1. In your project root, copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and paste your Firebase configuration:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_from_firebase
   VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

## Step 4: Enable Firebase Authentication

1. In Firebase Console, go to **Build** > **Authentication**
2. Click "Get started"
3. Enable **Email/Password** provider:
   - Click on "Email/Password"
   - Toggle "Enable"
   - Click "Save"

## Step 5: Create Firestore Database

1. In Firebase Console, go to **Build** > **Firestore Database**
2. Click "Create database"
3. Select mode:
   - Choose **"Start in test mode"** for development
   - Click "Next"
4. Choose a location (preferably closest to your users)
5. Click "Enable"

## Step 6: Set Up Firestore Security Rules

In Firestore Database, go to **Rules** tab and paste these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write all documents
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Click "Publish" to save the rules.

> **Note**: These are permissive rules for development. In production, you should use more restrictive rules.

## Step 7: Create Admin User

1. In Firebase Console, go to **Build** > **Authentication** > **Users**
2. Click "Add user"
3. Enter:
   - Email: `admin@courierhub.com` (or your preferred email)
   - Password: Choose a strong password
4. Click "Add user"
5. Copy the **User UID** (you'll need this)

## Step 8: Create User Document in Firestore

1. Go to **Firestore Database**
2. Click "Start collection"
3. Collection ID: `users`
4. For the first document:
   - Document ID: Paste the **User UID** from Step 7
   - Add fields:
     ```
     email: admin@courierhub.com (string)
     name: Super Admin (string)
     role: admin (string)
     phone: +91-9876543210 (string)
     isActive: true (boolean)
     createdAt: (Click "Add field" > type: timestamp > click on clock icon to set current timestamp)
     ```
5. Click "Save"

## Step 9: Seed Sample Data

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open your browser to `http://localhost:5173`

3. Open browser Dev Tools (F12) and go to **Console** tab

4. Run the seed script:
   ```javascript
   import(' /src/lib/seedData.ts').then(module => module.seedAllData())
   ```

   Or alternatively, add this line to `src/main.tsx` temporarily:
   ```typescript
   import { seedAllData } from './lib/seedData';
   // seedAllData(); // Uncomment to seed data
   ```

5. Check Firestore Database to verify data was added

## Step 10: Test Login

1. Go to `http://localhost:5173`
2. Enter credentials:
   - Email: `admin@courierhub.com`
   - Password: (the password you set in Step 7)
3. Click "Admin Portal"
4. You should be redirected to the admin dashboard!

## Troubleshooting

### Error: "Firebase configuration missing"
- Make sure `.env.local` exists and has all required variables
- Restart the dev server after adding environment variables

### Error: "Permission denied"
- Check Firestore security rules
- Verify the user is authenticated
- Make sure you're using the correct user UID

### Error: "User data not found"
- Make sure you created the user document in Firestore (Step 8)
- Verify the document ID matches the Authentication UID

### Data not showing in dashboard
- Run the seed script to populate sample data
- Check browser console for any errors
- Verify Firestore rules allow read access

## Production Deployment

Before deploying to production:

1. **Update Firestore Security Rules** to be more restrictive:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read: if request.auth != null;
         allow write: if request.auth != null && request.auth.uid == userId;
       }
       
       match /clients/{clientId} {
         allow read, write: if request.auth != null;
       }
       
       match /shipments/{shipmentId} {
         allow read, write: if request.auth != null;
       }
       
       match /courierAPIs/{courierId} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

2. **Set environment variables** in your hosting platform

3. **Enable Firebase App Check** for additional security

4. **Set up proper backup strategy** for Firestore

## Need Help?

If you encounter issues:
- Check the [Firebase Documentation](https://firebase.google.com/docs)
- Review browser console for error messages
- Verify all steps were completed in order
