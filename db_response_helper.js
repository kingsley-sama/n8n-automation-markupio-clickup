const SupabaseService = require('./supabase-service');

/**
 * Search for a project by (partial) project name, case-insensitive, returns first match with full details
 * @param {string} partialName
 * @returns {Promise<object|null>}
 */
async function getProjectByPartialName(partialName) {
  try {
    const supabaseService = new SupabaseService();
    const { data: project, error } = await supabaseService.supabase
      .from('markup_projects')
      .select(`*, scraped_data!inner(url, scraping_timestamp), markup_threads ( *, markup_comments(*) )`)
      .ilike('project_name', `%${partialName}%`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    if (error || !project) return null;
    
    const threads = (project.markup_threads || []).map(thread => ({
      threadName: thread.thread_name,
      imageIndex: thread.image_index,
      imagePath: thread.image_path,
      imageFilename: thread.image_filename,
      localImagePath: thread.local_image_path,
      hasAttachments: thread.has_attachments || false,
      comments: (thread.markup_comments || []).map(comment => ({
        id: comment.id,
        index: comment.comment_index,
        pinNumber: comment.pin_number,
        content: comment.content,
        user: comment.user_name,
        attachments: comment.attachments || []
      }))
    }));
    
    // Check if ANY thread has attachments
    const hasAttachments = threads.some(thread => thread.hasAttachments);
    
    return {
      id: project.id,
      projectName: project.project_name,
      url: project.scraped_data.url,
      totalThreads: project.total_threads,
      totalScreenshots: project.total_screenshots,
      timestamp: project.extraction_timestamp,
      hasAttachments: hasAttachments,
      threads: threads
    };
  } catch (error) {
    console.error('Error searching project by partial name:', error.message);
    return null;
  }
}

/**
 * Helper function to fetch project data from database
 * This serves as the source of truth after scraping/saving
 */
async function getProjectDataFromDB(url) {
  try {
    const supabaseService = new SupabaseService();
    const projectData = await supabaseService.getProjectFromDB(url);
    
    if (!projectData) {
      console.warn(`No project data found in database for URL: ${url}`);
      return null;
    }
    
    return projectData;
  } catch (error) {
    console.error('Error fetching project data from DB:', error.message);
    return null;
  }
}

/**
 * Get all projects (with optional pagination)
 */
async function getAllProjects(limit = 10, offset = 0) {
  try {
    const supabaseService = new SupabaseService();
    
    const { data, error } = await supabaseService.supabase
      .from('markup_projects')
      .select(`
        *,
        scraped_data!inner(url, scraping_timestamp),
        markup_threads(count)
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    
    return data.map(project => ({
      id: project.id,
      projectName: project.project_name,
      url: project.scraped_data.url,
      totalThreads: project.total_threads,
      totalScreenshots: project.total_screenshots,
      timestamp: project.extraction_timestamp,
      createdAt: project.created_at
    }));
  } catch (error) {
    console.error('Error fetching all projects:', error.message);
    return [];
  }
}

/**
 * Get project by ID with full details
 */
async function getProjectById(projectId) {
  try {
    const supabaseService = new SupabaseService();
    
    const { data: project, error } = await supabaseService.supabase
      .from('markup_projects')
      .select(`
        *,
        scraped_data!inner(url, scraping_timestamp),
        markup_threads (
          *,
          markup_comments (*)
        )
      `)
      .eq('id', projectId)
      .single();
    
    if (error) throw error;
    
    const threads = (project.markup_threads || []).map(thread => ({
      threadName: thread.thread_name,
      imageIndex: thread.image_index,
      imagePath: thread.image_path,
      imageFilename: thread.image_filename,
      localImagePath: thread.local_image_path,
      hasAttachments: thread.has_attachments || false,
      comments: (thread.markup_comments || []).map(comment => ({
        id: comment.id,
        index: comment.comment_index,
        pinNumber: comment.pin_number,
        content: comment.content,
        user: comment.user_name,
        attachments: comment.attachments || []
      }))
    }));
    
    // Check if ANY thread has attachments
    const hasAttachments = threads.some(thread => thread.hasAttachments);
    
    return {
      success: true,
      url: project.scraped_data.url,
      projectName: project.project_name,
      totalThreads: project.total_threads,
      totalScreenshots: project.total_screenshots,
      timestamp: project.extraction_timestamp,
      hasAttachments: hasAttachments,
      threads: threads
    };
  } catch (error) {
    console.error('Error fetching project by ID:', error.message);
    return null;
  }
}

/**
 * Search threads by content
 */
async function searchThreadsByContent(searchTerm, limit = 20) {
  try {
    const supabaseService = new SupabaseService();
    
    const { data, error } = await supabaseService.supabase
      .from('markup_comments')
      .select(`
        *,
        markup_threads!inner(
          *,
          markup_projects!inner(
            project_name,
            scraped_data!inner(url)
          )
        )
      `)
      .ilike('content', `%${searchTerm}%`)
      .limit(limit);
    
    if (error) throw error;
    
    return data.map(comment => ({
      commentId: comment.id,
      content: comment.content,
      user: comment.user_name,
      pinNumber: comment.pin_number,
      attachments: comment.attachments || [],
      threadName: comment.markup_threads.thread_name,
      projectName: comment.markup_threads.markup_projects.project_name,
      url: comment.markup_threads.markup_projects.scraped_data.url
    }));
  } catch (error) {
    console.error('Error searching threads:', error.message);
    return [];
  }
}

/**
 * Get statistics
 */
async function getStatistics() {
  try {
    const supabaseService = new SupabaseService();
    
    const { data: projectCount } = await supabaseService.supabase
      .from('markup_projects')
      .select('id', { count: 'exact', head: true });
    
    const { data: threadCount } = await supabaseService.supabase
      .from('markup_threads')
      .select('id', { count: 'exact', head: true });
    
    const { data: commentCount } = await supabaseService.supabase
      .from('markup_comments')
      .select('id', { count: 'exact', head: true });
    
    return {
      totalProjects: projectCount?.count || 0,
      totalThreads: threadCount?.count || 0,
      totalComments: commentCount?.count || 0
    };
  } catch (error) {
    console.error('Error fetching statistics:', error.message);
    return {
      totalProjects: 0,
      totalThreads: 0,
      totalComments: 0
    };
  }
}

module.exports = {
  getProjectDataFromDB,
  getAllProjects,
  getProjectById,
  searchThreadsByContent,
  getStatistics,
  getProjectByPartialName
};