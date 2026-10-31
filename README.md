# SkinCart

Scan a selfie with the YouCam AI Skin Analysis API, rank the concerns that matter, and build a budget skincare cart with an AM/PM routine and ingredient clash warnings. Re-scan later to see if the routine is working.

Built for the YouCam API Skin AI & eCommerce VTO Hackathon.

## YouCam API used
AI Skin Analysis v2.0 (`/s2s/v2.0/file` upload, `/s2s/v2.0/task/skin-analysis`, poll task). See `src/lib/youcam.ts`.

## Run
```
cp .env.example .env.local   # add YOUCAM_API_KEY
npm install && npm run dev
```
Without a key the app runs on sample data and shows a "demo data" badge.

## License
MIT
