// backend/src/controllers/aiController.js

/**
 * AI Chat endpoint
 * POST /api/ai/chat
 * body: { message, courseId, context }
 */
export const aiChat = async (req, res) => {
  try {
    const { message, courseId, context } = req.body;
    
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }
    
    // Simulate AI response (replace with actual AI service integration)
    // For now, return a helpful response based on the message
    const responses = {
      'help': 'I can help you with your learning journey! Ask me about study tips, course content, or learning strategies.',
      'roadmap': 'A good roadmap starts with fundamentals, then builds to advanced topics. Would you like me to create a personalized roadmap for you?',
      'progress': 'Track your progress by completing tasks and updating your roadmap steps. Consistency is key!',
      'default': `I understand you're asking about: "${message}". Here's some guidance: Focus on understanding the fundamentals first, practice regularly, and don't hesitate to ask your mentor for clarification.`
    };
    
    let response = responses.default;
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('help') || lowerMessage.includes('what can you')) {
      response = responses.help;
    } else if (lowerMessage.includes('roadmap') || lowerMessage.includes('plan')) {
      response = responses.roadmap;
    } else if (lowerMessage.includes('progress') || lowerMessage.includes('track')) {
      response = responses.progress;
    }
    
    return res.json({ 
      response,
      timestamp: new Date()
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Generate AI content for course (roadmap-step-bound).
 * POST /api/ai/generate-content
 * body: { courseId, domain, title, roadmapStepId } — roadmapStepId required
 */
export const generateContent = async (req, res) => {
  try {
    const { courseId, domain, title, roadmapStepId, roadmapId } = req.body;

    if (!roadmapStepId) {
      return res.status(400).json({
        message: 'AI content must be generated from roadmap step',
      });
    }

    const RoadmapStep = (await import('../models/RoadmapStep.js')).default;
    const step = await RoadmapStep.findById(roadmapStepId);
    if (!step) {
      return res.status(404).json({ message: 'Roadmap step not found' });
    }
    if (roadmapId && step.roadmapId.toString() !== roadmapId.toString()) {
      return res.status(400).json({
        message: 'Roadmap step does not belong to the specified roadmap',
      });
    }
    if (step.aiContentGenerated === true) {
      return res.status(400).json({
        message: 'AI content already generated for this roadmap step',
      });
    }

    const stepTitle = title || step.title || 'Course Content';
    const stepDomain = domain || step.level || 'the Domain';

    const content = `# ${stepTitle}

## Introduction to ${stepDomain}

Welcome to your learning journey! This course will help you master ${stepDomain}.

### Key Topics:
1. Fundamentals and basics
2. Core concepts and principles
3. Practical applications
4. Advanced techniques
5. Real-world projects

### Learning Objectives:
- Understand the fundamental concepts
- Apply knowledge in practical scenarios
- Build real-world projects
- Master advanced topics

### Study Tips:
- Practice regularly
- Review previous lessons
- Ask questions when stuck
- Work on projects to reinforce learning

This content is AI-generated and can be customized based on your specific needs.`;

    step.aiContentGenerated = true;
    await step.save();

    return res.json({ content });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

