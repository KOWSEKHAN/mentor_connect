// backend/src/controllers/courseController.js
import Course from '../models/Course.js';
import Mentorship from '../models/Mentorship.js';
import User from '../models/User.js';
import MentorRequest from '../models/MentorRequest.js';

/**
 * Get mentee's courses
 * GET /api/courses/me
 */
export const getMyCourses = async (req, res) => {
  try {
    const menteeId = req.user._id;
    const courses = await Course.find({ mentee: menteeId })
      .populate('mentor', 'name email')
      .sort({ updatedAt: -1 });
    return res.json({ courses });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get single course
 * GET /api/courses/:courseId
 */
export const getCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;
    
    const course = await Course.findById(courseId)
      .populate('mentor', 'name email')
      .populate('mentee', 'name email');
    
    if (!course) return res.status(404).json({ message: 'Course not found' });
    
    // Check if user is mentor or mentee of this course
    const menteeId = course.mentee._id ? course.mentee._id.toString() : course.mentee.toString();
    const mentorId = course.mentor ? (course.mentor._id ? course.mentor._id.toString() : course.mentor.toString()) : null;
    if (menteeId !== userId.toString() && (mentorId && mentorId !== userId.toString())) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    return res.json({ course });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Update course (AI content, roadmap, tasks, notes, progress)
 * PATCH /api/courses/:courseId
 */
export const updateCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;
    const { aiContent, roadmap, tasks, notes, progress } = req.body;
    
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    
    // Check authorization
    const menteeId = course.mentee._id ? course.mentee._id.toString() : course.mentee.toString();
    const mentorId = course.mentor ? (course.mentor._id ? course.mentor._id.toString() : course.mentor.toString()) : null;
    if (menteeId !== userId.toString() && (mentorId && mentorId !== userId.toString())) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    if (aiContent !== undefined) course.aiContent = aiContent;
    if (roadmap !== undefined) course.roadmap = roadmap;
    if (tasks !== undefined) course.tasks = tasks;
    if (notes !== undefined) course.notes = notes;
    if (progress !== undefined) course.progress = Math.max(0, Math.min(100, Number(progress)));
    
    course.updatedAt = new Date();
    await course.save();
    
    return res.json({ message: 'Course updated', course });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Create course from mentorship
 * POST /api/courses
 * body: { mentorshipId, title, domain }
 */
export const createCourse = async (req, res) => {
  try {
    const { mentorshipId, title, domain } = req.body;
    const menteeId = req.user._id;
    
    const mentorship = await Mentorship.findById(mentorshipId);
    if (!mentorship) return res.status(404).json({ message: 'Mentorship not found' });
    if (mentorship.mentee.toString() !== menteeId.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    const course = await Course.create({
      title,
      domain: domain || mentorship.domain,
      mentor: mentorship.mentor,
      mentee: menteeId
    });
    
    return res.status(201).json({ message: 'Course created', course });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Assign mentor to course (after course creation)
 * PATCH /api/courses/:courseId/assign-mentor
 * body: { mentorId }
 */
export const assignMentorToCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { mentorId } = req.body;
    const menteeId = req.user._id;

    if (!mentorId) {
      return res.status(400).json({ message: 'mentorId is required' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Verify mentee owns this course
    if (course.mentee.toString() !== menteeId.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Verify mentor exists and is actually a mentor
    const mentor = await User.findById(mentorId);
    if (!mentor || mentor.role !== 'mentor') {
      return res.status(400).json({ message: 'Invalid mentor' });
    }

    // Assign mentor to course (DO NOT create mentorship here)
    course.mentor = mentorId;
    course.updatedAt = new Date();
    await course.save();

    return res.json({ message: 'Mentor assigned to course', course });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Search courses and mentor specializations
 * GET /api/search/course?query=...
 */
export const searchCourseAndDomain = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.trim().length === 0) {
      return res.json({ suggestions: [] });
    }

    const searchTerm = query.toLowerCase().trim();
    const suggestions = [];

    // Search existing course titles
    const courses = await Course.find({
      title: { $regex: searchTerm, $options: 'i' }
    })
      .select('title domain')
      .limit(10);

    const courseTitles = new Set();
    courses.forEach(course => {
      if (course.title) {
        courseTitles.add(course.title);
      }
    });

    Array.from(courseTitles).forEach(title => {
      suggestions.push({
        name: title,
        type: 'course'
      });
    });

    // Search mentor specializations (using interests and extractedSkills from User model)
    const mentors = await User.find({ role: 'mentor' })
      .select('interests extractedSkills')
      .limit(50);

    const specializations = new Set();
    mentors.forEach(mentor => {
      [...(mentor.interests || []), ...(mentor.extractedSkills || [])].forEach(skill => {
        if (skill && skill.toLowerCase().includes(searchTerm)) {
          specializations.add(skill);
        }
      });
    });

    Array.from(specializations).slice(0, 10).forEach(spec => {
      suggestions.push({
        name: spec,
        type: 'domain'
      });
    });

    return res.json({ suggestions });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Search mentors by name
 * GET /api/search/mentor?name=...
 */
export const searchMentorByName = async (req, res) => {
  try {
    const { name } = req.query;
    if (!name || name.trim().length === 0) {
      return res.json({ mentors: [] });
    }

    const searchTerm = name.toLowerCase().trim();
    const mentors = await User.find({
      role: 'mentor',
      name: { $regex: searchTerm, $options: 'i' }
    })
      .select('name email expertise keywords interests')
      .limit(20);

    const results = mentors.map(m => {
      // Use expertise for mentor (fallback to keywords/interests for backward compatibility)
      const skills = [
        ...(m.expertise || []),
        ...(m.keywords || []),
        ...(m.interests || [])
      ];
      return {
        _id: m._id,
        name: m.name,
        email: m.email,
        specialization: skills.slice(0, 3).join(', ') || 'General'
      };
    });

    return res.json({ mentors: results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Start a course (with or without mentor)
 * POST /api/course/start
 * body: { course: { name, type }, mentor: { _id, ... } | null }
 */
export const startCourse = async (req, res) => {
  try {
    const { course, mentor } = req.body;
    const menteeId = req.user._id;

    if (!course || !course.name) {
      return res.status(400).json({ message: 'Course name is required' });
    }

    // Determine course title and domain
    const courseTitle = course.name;
    const courseDomain = course.type === 'domain' ? course.name : (course.domain || 'General');

    // If mentor is selected, send mentor request
    if (mentor && mentor._id) {
      const mentorUser = await User.findById(mentor._id);
      if (!mentorUser || mentorUser.role !== 'mentor') {
        return res.status(400).json({ message: 'Invalid mentor' });
      }

      // Check for existing pending request
      const existingRequest = await MentorRequest.findOne({
        mentee: menteeId,
        mentor: mentor._id,
        status: 'pending'
      });

      if (!existingRequest) {
        // Create mentor request
        await MentorRequest.create({
          mentee: menteeId,
          mentor: mentor._id,
          domain: courseDomain,
          message: `I would like to learn ${courseDomain}`
        });
      }
    }

    // Create course (mentor is optional now)
    const newCourse = await Course.create({
      title: courseTitle,
      domain: courseDomain,
      mentor: mentor?._id || null,
      mentee: menteeId
    });

    return res.status(201).json({
      message: mentor ? 'Course started and mentor request sent!' : 'Course started in independent learning mode!',
      course: newCourse
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

