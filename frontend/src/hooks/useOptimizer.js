import { useState, useCallback } from 'react';
import { optimize, compareAlgorithms } from '../services/api';

export const useOptimizer = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [error, setError] = useState(null);

  const runOptimization = useCallback(async (params, directResult = null) => {
    if (directResult) {
      setResult(directResult);
      return directResult;
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await optimize(params);
      setResult(resp.data);
      return resp.data;
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const runComparison = useCallback(async (params, directResult = null) => {
    if (directResult) {
      setComparison(directResult);
      return directResult;
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await compareAlgorithms(params);
      setComparison(resp.data);
      return resp.data;
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, result, comparison, error, runOptimization, runComparison, setResult, setComparison };
};
