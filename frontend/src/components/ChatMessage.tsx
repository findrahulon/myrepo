import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Typography,
  Paper,
  Tabs,
  Tab,
  Divider,
} from '@mui/material';
import { Person, SmartToy, SupportAgent } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import type { ChatMessage as ChatMessageType } from '../types';
import ConfidenceIndicator from './ConfidenceIndicator';
import SourcePanel from './SourcePanel';
import ExplanationPanel from './ExplanationPanel';
import FeedbackWidget from './FeedbackWidget';
import { requestEscalation } from '../services/api';

interface Props {
  message: ChatMessageType;
}

const ChatMessageComponent: React.FC<Props> = ({ message }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [escalationError, setEscalationError] = useState<string | null>(null);
  const isUser = message.role === 'user';
  const isLowConfidence = message.confidence?.level === 'LOW';

  const handleEscalate = async () => {
    if (!message.meta?.request_id) return;

    setEscalating(true);
    setEscalationError(null);
    try {
      await requestEscalation(
        message.meta.request_id,
        'User requested human review for a low-confidence answer',
      );
      setEscalated(true);
    } catch (err) {
      setEscalationError(err instanceof Error ? err.message : 'Failed to request review');
    } finally {
      setEscalating(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        mb: 2,
        px: 1,
      }}
    >
      <Paper
        elevation={1}
        sx={{
          p: 2,
          maxWidth: isUser ? '70%' : '85%',
          bgcolor: isUser ? 'primary.dark' : 'background.paper',
          borderRadius: 2,
          borderTopRightRadius: isUser ? 0 : 2,
          borderTopLeftRadius: isUser ? 2 : 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          {isUser ? <Person fontSize="small" /> : <SmartToy fontSize="small" color="primary" />}
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {isUser ? 'You' : 'RAGnarok'} • {message.timestamp.toLocaleTimeString()}
          </Typography>
          {message.meta && (
            <Typography variant="caption" sx={{ color: 'text.disabled', ml: 'auto' }}>
              {message.meta.latency_ms}ms
            </Typography>
          )}
        </Box>

        <Box sx={{ '& p': { m: 0, mb: 1 }, '& p:last-child': { mb: 0 } }}>
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </Box>

        {!isUser && (message.citations || message.confidence || message.explanation) && (
          <>
            <Divider sx={{ my: 1.5 }} />

            {message.confidence && (
              <ConfidenceIndicator confidence={message.confidence} />
            )}

            {isLowConfidence && (
              <Alert
                severity="warning"
                sx={{ mb: 1.5 }}
                action={
                  <Button
                    color="inherit"
                    size="small"
                    startIcon={<SupportAgent />}
                    onClick={handleEscalate}
                    disabled={escalating || escalated || !message.meta?.request_id}
                  >
                    {escalated ? 'Review Requested' : escalating ? 'Requesting...' : 'Request Human Review'}
                  </Button>
                }
              >
                Low confidence answer. Verify this with a human expert before using it for decisions.
              </Alert>
            )}

            {escalationError && (
              <Alert severity="error" sx={{ mb: 1.5 }}>
                {escalationError}
              </Alert>
            )}

            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              sx={{ minHeight: 32, mb: 1 }}
            >
              <Tab label="Sources" sx={{ minHeight: 32, py: 0 }} />
              <Tab label="Explanation" sx={{ minHeight: 32, py: 0 }} />
            </Tabs>

            {activeTab === 0 && message.citations && (
              <SourcePanel citations={message.citations} />
            )}
            {activeTab === 1 && message.explanation && (
              <ExplanationPanel explanation={message.explanation} />
            )}

            <Divider sx={{ my: 1 }} />
            <FeedbackWidget
              queryId={message.meta?.request_id}
              queryText={message.content}
            />
          </>
        )}
      </Paper>
    </Box>
  );
};

export default ChatMessageComponent;
