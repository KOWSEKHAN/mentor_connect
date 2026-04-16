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
    if (req.user?.role !== 'mentor') {
      return res.status(403).json({ message: 'Mentor only' });
    }
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

/**
 * Generate AI content for specific level (Mentor controlled)
 * POST /api/ai/generate-level-content
 * body: { courseId, level, prompt }
 */
export const generateLevelContent = async (req, res) => {
  try {
    if (req.user?.role !== 'mentor') {
      return res.status(403).json({ message: 'Mentor only' });
    }
    const { courseId, level, prompt } = req.body;

    if (!courseId || !level) {
      return res.status(400).json({ message: 'courseId and level are required' });
    }

    const contentObj = {
      explanation: `(AI) Generated explanation for ${level}. Prompt used: ${prompt || 'None'}. Make sure to thoroughly study these materials to grasp the core concepts of the ${level} stage.`,
      examples: [`Basic Example 1 for ${level}`, `Practical Example 2 for ${level}`],
      resources: [`https://example.com/guide-${level}`, `https://example.com/docs`]
    };

    const AIContent = (await import('../models/AIContent.js')).default;
    
    // We stringify the content since the existing schema uses String for content, or save structure if possible.
    // The prompt specified "content: { explanation, examples, resources }". 
    // We'll store it stringified to respect schema but emit the object for real-time.
    await AIContent.findOneAndUpdate(
      { courseId, level },
      { 
        content: JSON.stringify(contentObj),
        generatedBy: req.user._id,
        courseId,
        level,
        status: 'draft'
      },
      { upsert: true, new: true }
    );

    const { emitCourseEvent } = await import('../socket/eventBuilder.js');
    await emitCourseEvent('ai_content_generated', courseId, {
      courseId,
      level,
      content: contentObj
    });

    return res.json({ content: contentObj });
  } catch (err) {
    console.error('generateLevelContent error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Publish AI content for specific level to the mentee
 * POST /api/ai/publish-level-content
 * body: { courseId, level }
 */
export const publishLevelContent = async (req, res) => {
  try {
    if (req.user?.role !== 'mentor') {
      return res.status(403).json({ message: 'Mentor only' });
    }
    const { courseId, level } = req.body;

    if (!courseId || !level) {
      return res.status(400).json({ message: 'courseId and level are required' });
    }

    const AIContent = (await import('../models/AIContent.js')).default;
    const content = await AIContent.findOne({ courseId, level });

    if (!content) {
      return res.status(404).json({ message: 'Draft content not found for this level' });
    }

    content.status = 'published';
    await content.save();

    let parsedContent;
    try {
      parsedContent = JSON.parse(content.content);
    } catch {
      parsedContent = { explanation: content.content, examples: [], resources: [] };
    }

    const { emitCourseEvent } = await import('../socket/eventBuilder.js');
    await emitCourseEvent('ai_content_published', courseId, {
      courseId,
      level,
      content: parsedContent,
      updatedAt: content.updatedAt
    });

    return res.json({ message: 'Content published to mentee', status: 'published' });
  } catch (err) {
    console.error('publishLevelContent error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get AI content for a course level
 * GET /api/ai/content/:courseId?level=Intermediate
 */
export const getCourseLevelContent = async (req, res) => {
  try {
    const { courseId } = req.params;
    const level = (req.query.level || 'beginner').toLowerCase();
    
    if (!courseId) {
      return res.status(400).json({ message: 'courseId is required' });
    }
    
    const isMentor = req.user?.role === 'mentor';
    const query = { courseId, level };
    if (!isMentor) {
      query.status = 'published';
    }

    const AIContent = (await import('../models/AIContent.js')).default;
    const content = await AIContent.findOne(query);

    return res.json({ content: content ? content.content : '' });
  } catch (err) {
    console.error('getCourseLevelContent error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

