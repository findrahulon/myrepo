import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Tabs,
  Tab,
  TextField,
} from '@mui/material';
import { CloudUpload, CheckCircle, Language } from '@mui/icons-material';
import { uploadDocument, ingestURL } from '../services/api';

interface Props {
  onUploadComplete?: () => void;
}

const DocumentUpload: React.FC<Props> = ({ onUploadComplete }) => {
  const [tab, setTab] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ filename: string; chunks: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState('general');
  const [accessLevel, setAccessLevel] = useState('basic');
  const [url, setUrl] = useState('');

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

  const handleUrlSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    // Basic URL validation
    try {
      new URL(url);
    } catch (err) {
      setError('Please enter a valid absolute URL (e.g. https://example.com)');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const data = await ingestURL(url, department, accessLevel);
      setResult({ filename: data.filename, chunks: data.chunks_created });
      setUrl('');
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'URL Ingestion failed');
    } finally {
      setUploading(false);
    }
  }, [url, department, accessLevel, onUploadComplete]);

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
        Add Knowledge Source
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 120, flex: 1 }}>
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

        <FormControl size="small" sx={{ minWidth: 120, flex: 1 }}>
          <InputLabel>Access Level</InputLabel>
          <Select value={accessLevel} label="Access Level" onChange={(e) => setAccessLevel(e.target.value)}>
            <MenuItem value="basic">Basic</MenuItem>
            <MenuItem value="standard">Standard</MenuItem>
            <MenuItem value="elevated">Elevated</MenuItem>
            <MenuItem value="full">Full</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, val) => {
          setTab(val);
          setError(null);
          setResult(null);
        }}
        variant="fullWidth"
        sx={{
          mb: 2,
          minHeight: 36,
          '& .MuiTab-root': {
            minHeight: 36,
            py: 0.5,
            fontSize: '0.8rem',
            textTransform: 'none',
          }
        }}
      >
        <Tab label="File Upload" icon={<CloudUpload fontSize="small" />} iconPosition="start" />
        <Tab label="Webpage Link" icon={<Language fontSize="small" />} iconPosition="start" />
      </Tabs>

      {tab === 0 ? (
        <Button
          component="label"
          variant="outlined"
          startIcon={<CloudUpload />}
          disabled={uploading}
          fullWidth
          size="small"
        >
          {uploading ? 'Processing...' : 'Select PDF or DOCX'}
          <input
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            hidden
            onChange={handleFileChange}
          />
        </Button>
      ) : (
        <Box component="form" onSubmit={handleUrlSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            label="Webpage URL"
            placeholder="https://example.com/article"
            size="small"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={uploading}
            fullWidth
            required
            InputProps={{
              sx: { fontSize: '0.85rem' }
            }}
            InputLabelProps={{
              sx: { fontSize: '0.85rem' }
            }}
          />
          <Button
            type="submit"
            variant="contained"
            color="primary"
            startIcon={<Language />}
            disabled={uploading || !url.trim()}
            fullWidth
            size="small"
          >
            {uploading ? 'Ingesting...' : 'Ingest Page'}
          </Button>
        </Box>
      )}

      {uploading && <LinearProgress sx={{ mt: 1.5 }} />}

      {result && (
        <Alert icon={<CheckCircle />} severity="success" sx={{ mt: 1.5, fontSize: '0.8rem', py: 0 }}>
          {result.filename} uploaded — {result.chunks} chunks created
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1.5, fontSize: '0.8rem', py: 0 }}>
          {error}
        </Alert>
      )}
    </Paper>
  );
};

export default DocumentUpload;
