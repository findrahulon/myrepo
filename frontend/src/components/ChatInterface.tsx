import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  Typography,
  Paper,
  CircularProgress,
} from '@mui/material';
import { Send, AutoAwesome } from '@mui/icons-material';
import { sendQuery } from '../services/api';
import type { ChatMessage } from '../types';
import ChatMessageComponent from './ChatMessage';

interface Props {
  username: string;
}

const getStorageKey = (username: string) => `ragnarok:chat:${username}`;

const loadStoredMessages = (username: string): ChatMessage[] => {
  try {
    const stored = localStorage.getItem(getStorageKey(username));
    if (!stored) return [];

    const parsed = JSON.parse(stored) as ChatMessage[];
    return parsed.map((message) => ({
      ...message,
      timestamp: new Date(message.timestamp),
    }));
  } catch {
    localStorage.removeItem(getStorageKey(username));
    return [];
  }
};

const ChatInterface: React.FC<Props> = ({ username }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredMessages(username));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadStoredMessages(username));
  }, [username]);

  useEffect(() => {
    localStorage.setItem(getStorageKey(username), JSON.stringify(messages));
  }, [messages, username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const query = input.trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await sendQuery(query);
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.data.answer,
        timestamp: new Date(),
        citations: response.data.citations,
        confidence: response.data.confidence,
        explanation: response.data.explanation,
        meta: response.meta,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}. Please ensure all services are running.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 2 }}>
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', mt: 8 }}>
            <AutoAwesome sx={{ fontSize: 64, color: 'primary.main', mb: 2, opacity: 0.5 }} />
            <Typography variant="h5" sx={{ mb: 1, fontWeight: 600 }}>
              RAGnarok Knowledge Copilot
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 400, mx: 'auto' }}>
              Upload enterprise documents and ask questions. Get grounded, cited answers
              with confidence scores and full explainability.
            </Typography>
          </Box>
        )}
        {messages.map((msg) => (
          <ChatMessageComponent key={msg.id} message={msg} />
        ))}
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Searching knowledge base...
            </Typography>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Paper sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          fullWidth
          placeholder="Ask a question about your documents..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={loading}
          size="small"
          multiline
          maxRows={3}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={!input.trim() || loading}
          sx={{
            bgcolor: 'primary.main',
            color: 'white',
            '&:hover': { bgcolor: 'primary.dark' },
            '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
          }}
        >
          <Send />
        </IconButton>
      </Paper>
    </Box>
  );
};

export default ChatInterface;
