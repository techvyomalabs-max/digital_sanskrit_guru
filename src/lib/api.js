import axios from "axios";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:5001";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, "");

axios.defaults.baseURL = apiBaseUrl;

export { apiBaseUrl };
