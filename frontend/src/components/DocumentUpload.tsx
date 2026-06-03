import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  LinearProgress,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
} from '@mui/material';
import { CloudUpload, CheckCircle } from '@mui/icons-material';
import { uploadDocument } from '../services/api';

interface Props {
  onUploadComplete?: () => void;
}

const DocumentUpload: React.FC<Props> = ({ onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ filename: string; chunks: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState('general');
  const [accessLevel, setAccessLevel] = useState('basic');

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const data = await uploadDocument(file, department, accessLevel);
      setResult({ filename: data.filename, chunks: data.chunks_created });
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [department, accessLevel, onUploadComplete]);

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
        Upload Document
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Department</InputLabel>
          <Select value={department} label="Department" onChange={(e) => setDepartment(e.target.value)}>
            <MenuItem value="general">General</MenuItem>
            <MenuItem value="engineering">Engineering</MenuItem>
            <MenuItem value="hr">HR</MenuItem>
            <MenuItem value="finance">Finance</MenuItem>
            <MenuItem value="legal">Legal</MenuItem>
            <MenuItem value="it">IT</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Access Level</InputLabel>
          <Select value={accessLevel} label="Access Level" onChange={(e) => setAccessLevel(e.target.value)}>
            <MenuItem value="basic">Basic</MenuItem>
            <MenuItem value="standard">Standard</MenuItem>
            <MenuItem value="elevated">Elevated</MenuItem>
            <MenuItem value="full">Full</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Button
        component="label"
        variant="outlined"
        startIcon={<CloudUpload />}
        disabled={uploading}
        fullWidth
      >
        {uploading ? 'Processing...' : 'Select PDF or DOCX'}
        <input
          type="file"
          accept=".pdf,.docx,.doc,.txt"
          hidden
          onChange={handleFileChange}
        />
      </Button>

      {uploading && <LinearProgress sx={{ mt: 1 }} />}

      {result && (
        <Alert icon={<CheckCircle />} severity="success" sx={{ mt: 1 }}>
          {result.filename} uploaded — {result.chunks} chunks created
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Paper>
  );
};

export default DocumentUpload;
