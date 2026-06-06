import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  CircularProgress,
} from '@mui/material';
import { Description, PictureAsPdf, Article, Language } from '@mui/icons-material';
import { listDocuments } from '../services/api';
import type { Document } from '../types';

interface Props {
  refreshTrigger?: number;
}

const DocumentList: React.FC<Props> = ({ refreshTrigger }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const docs = await listDocuments();
        setDocuments(docs);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [refreshTrigger]);

  const getIcon = (type: string) => {
    if (type === 'pdf') return <PictureAsPdf color="error" />;
    if (type === 'docx' || type === 'doc') return <Article color="primary" />;
    if (type === 'url') return <Language color="secondary" />;
    return <Description />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return <CircularProgress size={20} />;
  }

  if (documents.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', py: 1 }}>
        No documents uploaded yet
      </Typography>
    );
  }

  return (
    <List dense>
      {documents.map((doc) => (
        <ListItem key={doc.id} sx={{ px: 0 }}>
          <ListItemIcon sx={{ minWidth: 36 }}>
            {getIcon(doc.file_type)}
          </ListItemIcon>
          <ListItemText
            primary={
              <Typography variant="body2" noWrap>
                {doc.filename}
              </Typography>
            }
            secondary={
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                <Chip label={formatSize(doc.file_size)} size="small" variant="outlined" />
                <Chip label={`${doc.chunk_count} chunks`} size="small" variant="outlined" />
                <Chip
                  label={doc.status}
                  size="small"
                  color={doc.status === 'embedded' ? 'success' : doc.status === 'chunked' ? 'warning' : 'default'}
                />
              </Box>
            }
          />
        </ListItem>
      ))}
    </List>
  );
};

export default DocumentList;
