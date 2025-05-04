import apiClient from "../utils/apiClient";

export const fetchData = async () => {
    try {
        const response = await apiClient.get("/api/test");
        return response.data;
    } catch (error) {
        console.error("Error fetching data:", error);
        throw error;
    }
};