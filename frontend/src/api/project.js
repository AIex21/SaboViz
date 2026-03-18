import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_BASE_URL,
});

export const projectApi = {
    // 1. Upload .lpg.json file
    uploadProject: async (file, name, options = {}) => {
        const {
            autoContinueUnresolved = false,
            runSummarization = true
        } = options;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        formData.append('auto_continue_unresolved', String(autoContinueUnresolved));
        formData.append('run_summarization', String(runSummarization));

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

    exportStaticProject: async (projectId) => {
        const response = await api.get(`/projects/${projectId}/export-static`);
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

    uploadTrace: async (projectId, files) => {
        const formData = new FormData();

        const fileList = Array.isArray(files) ? files : [files];
        if (fileList.length === 1) {
            formData.append('file', fileList[0]);
        } else {
            fileList.forEach((file) => formData.append('files', file));
        }

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
    },

    startDecomposition: async (projectId, distanceThreshold = 0.4, infrastructureThreshold = 0.3, useAi = true) => {
        const response = await api.post(`/projects/${projectId}/decompose`, null, {
            params: {
                distance_threshold: distanceThreshold,
                infrastructure_threshold: infrastructureThreshold,
                use_ai: useAi
            }
        });
        return response.data;
    },

    getFeatures: async (projectId) => {
        const response = await api.get(`/projects/${projectId}/features`);
        return response.data;
    },

    rerunSummarization: async (projectId) => {
        const response = await api.post(`/projects/${projectId}/summarization/rerun`);
        return response.data;
    },

    summarizeNode: async (projectId, nodeId) => {
        const response = await api.post(`/projects/${projectId}/nodes/summarize`, null, {
            params: { node_id: nodeId }
        });
        return response.data;
    }
};

export default api;