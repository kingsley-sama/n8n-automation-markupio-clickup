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

module.exports = {
  getProjectByPartialName
};