import { useState, useEffect } from 'react';
import { projectService } from '../services/projectService';

export const useProject = (projectId) => {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  const fetchProject = async () => {
    try {
      setLoading(true);
      const data = await projectService.getById(projectId);
      setProject(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateProject = async (updates) => {
    try {
      setLoading(true);
      const data = await projectService.update(projectId, updates);
      setProject(data);
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  return { project, loading, error, refresh: fetchProject, updateProject };
};