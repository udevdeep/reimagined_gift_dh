# 🚀 Vercel Deployment Guide

Follow these steps to deploy your site safely and ensure all "Server-Side" features (Admin uploads, Auth) work perfectly.

## 1. Vercel Project Setup
1. Push your code to a GitHub repository.
2. Connect the repository to Vercel.
3. **Framework Preset**: Select **"Other"**.
4. **Output Directory**: Ensure it is set to `.` (the root).

## 2. Environment Variables (CRITICAL)
In the Vercel Dashboard, go to **Settings > Environment Variables** and add these five keys:

| Key | Value (Find it in your Firebase Service Account JSON) |
| :--- | :--- |
| `FIREBASE_PROJECT_ID` | Your project ID (e.g. `dharchive-9f1a9`) |
| `FIREBASE_CLIENT_EMAIL` | The client email address from the JSON. |
| `FIREBASE_PRIVATE_KEY` | The entire private key string (include the BEGIN/END parts). |
| `BLOB_READ_WRITE_TOKEN` | Generated in Vercel Storage tab (for Home video). |

> **Note on Private Key**: Paste the whole key. Vercel handles the newlines automatically, but our code also fixes them just in case.

## 3. Storage Setup (Vercel Blob)
1. Go to the **Storage** tab in your Vercel Project.
2. Click **Create Database** and select **Blob**.
3. Once created, click **Connect** to link it to your project. This will automatically add the `BLOB_READ_WRITE_TOKEN`.

## 4. Final Firebase Checks
1. Ensure your **Firestore Rules** and **Storage Rules** are published.
2. In **Google Cloud Credentials**, ensure your Vercel URL (e.g. `https://your-site.vercel.app/*`) is authorized.
3. In **Firebase Auth Settings**, add `your-site.vercel.app` to the **Authorized Domains** list.

## 5. First Deploy
Once variables are set, trigger a **Redeploy** on Vercel. Your site is now live! ✨
