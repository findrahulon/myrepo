import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { ExpandMore, Description, Pages } from '@mui/icons-material';
import type { Citation } from '../types';

interface Props {
  citations: Citation[];
}

const SourcePanel: React.FC<Props> = ({ citations }) => {
  if (!citations.length) return null;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 600 }}>
        Sources ({citations.length})
      </Typography>
      {citations.map((citation) => (
        <Accordion
          key={citation.index}
          sx={{
            bgcolor: 'background.default',
            mb: 0.5,
            '&:before': { display: 'none' },
            borderRadius: 1,
          }}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
              <Chip
                label={`[${citation.index}]`}
                size="small"
                color="primary"
                sx={{ minWidth: 36 }}
              />
              <Description fontSize="small" sx={{ color: 'text.secondary' }} />
              <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                {citation.doc_title}
              </Typography>
              {citation.page > 0 && (
                <Chip
                  icon={<Pages />}
                  label={`p.${citation.page}`}
                  size="small"
                  variant="outlined"
                />
              )}
              <Chip
                label={`${Math.round(citation.relevance_score * 100)}%`}
                size="small"
                color={citation.relevance_score > 0.7 ? 'success' : 'warning'}
                variant="outlined"
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
              "{citation.snippet}..."
            </Typography>
            {citation.section && (
              <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.disabled' }}>
                Section: {citation.section}
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

export default SourcePanel;
