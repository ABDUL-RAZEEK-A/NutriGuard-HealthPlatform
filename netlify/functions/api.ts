import serverless from "serverless-http";
import app from "../../api/index";

// The serverless-http wrapper handles the mapping between 
// Netlify events and Express requests.
export const handler = serverless(app);
