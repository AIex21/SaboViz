import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_BASE_URL,
});

export const projectApi = {
    // 1. Upload .lpg.json file
    uploadProject: async (file, name) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);

        const response = await api.post('/projects/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
        return response.data;
    },

    getProjects: async () => {
        const response = await api.get('/projects');
        return response.data;
    },

    getProject: async (projectId) => {
        const response = await api.get('/projects/' + projectId);
        return response.data;
    },

    deleteProject: async (projectId) => {
        const response = await api.delete('/projects/' + projectId);
        return response.data;
    },

    getAllNodes: async (projectId) => {
        const response = await api.get('/projects/' + projectId + '/nodes');
        return response.data;
    },

    getAllEdges: async (projectId) => {
        const response = await api.get('/projects/' + projectId + '/edges');
        return response.data;
    },

    getRoots: async (projectId) => {
        const response = await api.get('/projects/' + projectId + '/roots');
        return response.data;
    },

    getChildren: async (projectId, parentId) => {
        const response = await api.get('/projects/' + projectId + '/children/', {
            params: { parent_id: parentId }
        });
        return response.data;
    },

    getAggregatedEdges: async (projectId, visibleIds) => {
        const response = await api.post('/projects/' + projectId + '/edges/aggregated', visibleIds);
        return response.data;
    },

    getUnresolvedIncludes: async (projectId) => {
        const response = await api.get('/projects/' + projectId + '/unresolved');
        return response.data;
    },

    continueIngestion: async (projectId) => {
        const response = await api.post('/projects/' + projectId + '/continue');
        return response.data;
    },

    getTraces: async (projectId) => {
        const response = await api.get('/projects/' + projectId + '/traces');
        return response.data;
    },

    getTraceFile: async (traceId) => {
        const response = await api.get('/traces/' + traceId + '/file');
        return response.data;
    },

    uploadTrace: async (projectId, file) => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await api.post(`/projects/${projectId}/traces`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    deleteTrace: async (traceId) => {
        const response = await api.delete('/traces/' + traceId);
        return response.data;
    },
    
    getHierarchy: async (projectId, nodeIds) => {
        const response = await api.post(`/projects/${projectId}/hierarchy`, nodeIds);
        return response.data;
    }
};

export default api;