import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  CheckCircle as HighIcon,
  Warning as MediumIcon,
  Error as LowIcon,
} from '@mui/icons-material';
import type { Confidence } from '../types';

interface Props {
  confidence: Confidence;
}

const levelConfig = {
  HIGH: { color: 'success' as const, icon: <HighIcon />, label: 'High Confidence' },
  MEDIUM: { color: 'warning' as const, icon: <MediumIcon />, label: 'Medium Confidence' },
  LOW: { color: 'error' as const, icon: <LowIcon />, label: 'Low Confidence' },
};

const ConfidenceIndicator: React.FC<Props> = ({ confidence }) => {
  const config = levelConfig[confidence.level] || levelConfig.LOW;

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Chip
          icon={config.icon}
          label={`${config.label} (${Math.round(confidence.overall * 100)}%)`}
          color={config.color}
          size="small"
          variant="outlined"
        />
      </Box>

      <Box sx={{ mt: 1 }}>
        {Object.entries(confidence.breakdown).map(([key, value]) => (
          <Tooltip key={key} title={`${Math.round(value * 100)}%`}>
            <Box sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>
                {key.replace(/_/g, ' ')}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={value * 100}
                color={value > 0.7 ? 'success' : value > 0.4 ? 'warning' : 'error'}
                sx={{ height: 4, borderRadius: 2 }}
              />
            </Box>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
};

export default ConfidenceIndicator;
