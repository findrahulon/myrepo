import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Button,
  Rating,
  Collapse,
  Snackbar,
  Alert,
} from '@mui/material';
import { ThumbUp, ThumbDown, Feedback } from '@mui/icons-material';
import { submitFeedback } from '../services/api';

interface Props {
  queryId?: string;
  queryText?: string;
}

const FeedbackWidget: React.FC<Props> = ({ queryId, queryText }) => {
  const [expanded, setExpanded] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [correction, setCorrection] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [snackOpen, setSnackOpen] = useState(false);

  const handleQuickFeedback = async (isPositive: boolean) => {
    const quickRating = isPositive ? 5 : 1;
    try {
      await submitFeedback(queryId, queryText, quickRating);
      setSubmitted(true);
      setSnackOpen(true);
    } catch {
      // Silently fail
    }
  };

  const handleSubmit = async () => {
    if (!rating) return;
    try {
      await submitFeedback(queryId, queryText, rating, comment, correction);
      setSubmitted(true);
      setExpanded(false);
      setSnackOpen(true);
    } catch {
      // Silently fail
    }
  };

  if (submitted) {
    return (
      <>
        <Typography variant="caption" sx={{ color: 'success.main' }}>
          Thank you for your feedback!
        </Typography>
        <Snackbar open={snackOpen} autoHideDuration={3000} onClose={() => setSnackOpen(false)}>
          <Alert severity="success" variant="filled">Feedback submitted</Alert>
        </Snackbar>
      </>
    );
  }

  return (
    <Box sx={{ mt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Was this helpful?
        </Typography>
        <IconButton size="small" onClick={() => handleQuickFeedback(true)} color="success">
          <ThumbUp fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => handleQuickFeedback(false)} color="error">
          <ThumbDown fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => setExpanded(!expanded)} color="primary">
          <Feedback fontSize="small" />
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ mt: 1, p: 1.5, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="caption" sx={{ mb: 0.5, display: 'block' }}>
            Rate this response:
          </Typography>
          <Rating
            value={rating}
            onChange={(_, val) => setRating(val)}
            size="small"
            sx={{ mb: 1 }}
          />
          <TextField
            label="Comment (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            fullWidth
            size="small"
            multiline
            rows={2}
            sx={{ mb: 1 }}
          />
          <TextField
            label="Suggested correction (optional)"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            fullWidth
            size="small"
            multiline
            rows={2}
            sx={{ mb: 1 }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleSubmit}
            disabled={!rating}
          >
            Submit Feedback
          </Button>
        </Box>
      </Collapse>
    </Box>
  );
};

export default FeedbackWidget;
