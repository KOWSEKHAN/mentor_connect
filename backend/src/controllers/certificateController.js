import mongoose from 'mongoose';
import Course from '../models/Course.js';

/**
 * GET /api/certificate/:courseId
 * Mentee-only. Returns certificate payload when course is completed.
 */
export const getCertificate = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: 'Invalid course id' });
    }

    const course = await Course.findById(courseId)
      .populate('mentor', 'name')
      .populate('mentorId', 'name')
      .populate('mentee', 'name');

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const menteeId = course.mentee?._id?.toString?.() || course.mentee?.toString?.() || String(course.mentee);
    if (String(menteeId) !== String(userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Completed when marked complete, or legacy rows with progress 100%.
    const isCompleted =
      course.status === 'completed' ||
      course.progress >= 100;

    if (!isCompleted) {
      return res.status(403).json({ message: 'Course not completed', locked: true });
    }

    const mentorName =
      course.mentor?.name ||
      course.mentorId?.name ||
      (course.mentor || course.mentorId ? 'Mentor' : 'Independent study');
    const menteeName = course.mentee?.name || 'Learner';

    return res.json({
      courseName: course.title,
      mentorName,
      menteeName,
      completedAt: course.completedAt || course.updatedAt,
    });
  } catch (err) {
    console.error('getCertificate failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
