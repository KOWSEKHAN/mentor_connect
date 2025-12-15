import OverviewView from './OverviewView'
import AIContentView from './AIContentView'
import RoadmapView from './RoadmapView'
import TasksView from './TasksView'
import NotesView from './NotesView'
import AIChatBot from './AIChatBot'

export default function ContentView({ activeTab, course, updateCourse, courseId, refreshCourse }) {
  switch (activeTab) {
    case 'overview':
      return <OverviewView course={course} />
    case 'ai-content':
      return <AIContentView course={course} updateCourse={updateCourse} courseId={courseId} refreshCourse={refreshCourse} />
    case 'roadmap':
      return <RoadmapView course={course} updateCourse={updateCourse} refreshCourse={refreshCourse} />
    case 'tasks':
      return <TasksView course={course} updateCourse={updateCourse} refreshCourse={refreshCourse} />
    case 'notes':
      return <NotesView course={course} updateCourse={updateCourse} refreshCourse={refreshCourse} />
    case 'ask-ai':
      return <AIChatBot course={course} />
    default:
      return <OverviewView course={course} />
  }
}

