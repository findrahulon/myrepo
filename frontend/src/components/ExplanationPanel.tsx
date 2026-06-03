import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
} from '@mui/material';
import { Psychology, Speed } from '@mui/icons-material';
import type { Explanation } from '../types';

interface Props {
  explanation: Explanation;
}

const ExplanationPanel: React.FC<Props> = ({ explanation }) => {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, color: 'secondary.main', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Psychology fontSize="small" />
        Why this answer?
      </Typography>

      <Paper sx={{ p: 2, bgcolor: 'background.default', mb: 1 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          {explanation.summary}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip label={`${explanation.sources_analyzed} source(s)`} size="small" variant="outlined" />
          <Chip label={`${explanation.chunks_used} chunk(s)`} size="small" variant="outlined" />
          <Chip
            icon={<Speed />}
            label={`Relevance: ${Math.round(explanation.avg_relevance * 100)}%`}
            size="small"
            variant="outlined"
            color={explanation.avg_relevance > 0.7 ? 'success' : 'warning'}
          />
          <Chip label={explanation.model_used} size="small" variant="outlined" color="primary" />
        </Box>
      </Paper>

      <Stepper orientation="vertical" sx={{ mt: 1 }}>
        {explanation.reasoning_steps.map((step, idx) => (
          <Step key={idx} active completed>
            <StepLabel>
              <Typography variant="caption">{step}</Typography>
            </StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
};

export default ExplanationPanel;
