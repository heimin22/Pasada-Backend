import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const apiClient = axios.create({
    baseURL: process.env.API_URL || "http://localhost:3000",
    timeout: 10000,
    headers: {
        "Content-Type": "application/json",
    }, 
});

export default apiClient;