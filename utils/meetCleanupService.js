import { supabase } from './supabase';

/**
 * Auto-delete service for cleaning up old meets
 * Deletes meets that are 12 hours past their scheduled time to save space and keep everything organized
 */

class MeetCleanupService {
  constructor() {
    this.isRunning = false;
    this.cleanupInterval = null;
    // Run cleanup every 2 hours
    this.CLEANUP_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
    // Delete meets 12 hours after they were scheduled
    this.DELETION_DELAY_HOURS = 12;
  }

  /**
   * Start the automatic cleanup service
   */
  start() {
    if (this.isRunning) {
      console.log('[MEET CLEANUP] Service already running');
      return;
    }

    console.log('[MEET CLEANUP] Starting automatic meet cleanup service');
    this.isRunning = true;

    // Run initial cleanup
    this.performCleanup();

    // Set up recurring cleanup
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the automatic cleanup service
   */
  stop() {
    if (!this.isRunning) {
      console.log('[MEET CLEANUP] Service not running');
      return;
    }

    console.log('[MEET CLEANUP] Stopping automatic meet cleanup service');
    this.isRunning = false;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Perform the actual cleanup of expired meets
   */
  async performCleanup() {
    try {
      console.log('[MEET CLEANUP] Starting cleanup process...');

      // Calculate cutoff time (12 hours ago)
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - this.DELETION_DELAY_HOURS);
      const cutoffISO = cutoffTime.toISOString();

      console.log(`[MEET CLEANUP] Deleting meets scheduled before: ${cutoffISO}`);

      // Find meets to delete (using both date_time and starts_at for compatibility)
      const { data: meetsToDelete, error: selectError } = await supabase
        .from('meets')
        .select('id, title, date_time, starts_at, created_at')
        .or(`date_time.lt.${cutoffISO},starts_at.lt.${cutoffISO}`)
        .order('date_time', { ascending: true })
        .limit(50); // Process in batches to avoid overload

      if (selectError) {
        console.error('[MEET CLEANUP] Error finding meets to delete:', selectError);
        return;
      }

      if (!meetsToDelete || meetsToDelete.length === 0) {
        console.log('[MEET CLEANUP] No expired meets found');
        return;
      }

      console.log(`[MEET CLEANUP] Found ${meetsToDelete.length} expired meets to delete`);

      // Delete expired meets in batches
      const meetIds = meetsToDelete.map(meet => meet.id);
      
      // First delete related records to maintain referential integrity
      await this.deleteRelatedRecords(meetIds);

      // Then delete the meets themselves
      const { error: deleteError } = await supabase
        .from('meets')
        .delete()
        .in('id', meetIds);

      if (deleteError) {
        console.error('[MEET CLEANUP] Error deleting expired meets:', deleteError);
        return;
      }

      console.log(`[MEET CLEANUP] Successfully deleted ${meetsToDelete.length} expired meets`);

      // Log details of deleted meets for debugging
      meetsToDelete.forEach(meet => {
        const scheduleTime = meet.starts_at || meet.date_time;
        console.log(`[MEET CLEANUP] Deleted: "${meet.title}" (scheduled: ${scheduleTime})`);
      });

    } catch (error) {
      console.error('[MEET CLEANUP] Unexpected error during cleanup:', error);
    }
  }

  /**
   * Delete related records before deleting meets to maintain referential integrity
   */
  async deleteRelatedRecords(meetIds) {
    try {
      console.log(`[MEET CLEANUP] Cleaning up related records for ${meetIds.length} meets`);

      // Delete meet participants
      const { error: participantsError } = await supabase
        .from('meet_participants')
        .delete()
        .in('meet_id', meetIds);

      if (participantsError) {
        console.warn('[MEET CLEANUP] Error deleting meet participants:', participantsError);
      }

      // Delete meet attendance
      const { error: attendanceError } = await supabase
        .from('meet_attendance')
        .delete()
        .in('meet_id', meetIds);

      if (attendanceError) {
        console.warn('[MEET CLEANUP] Error deleting meet attendance:', attendanceError);
      }

      // Delete meet reports
      const { error: reportsError } = await supabase
        .from('meet_reports')
        .delete()
        .in('meet_id', meetIds);

      if (reportsError) {
        console.warn('[MEET CLEANUP] Error deleting meet reports:', reportsError);
      }

      console.log('[MEET CLEANUP] Related records cleanup completed');

    } catch (error) {
      console.error('[MEET CLEANUP] Error cleaning up related records:', error);
    }
  }

  /**
   * Manual cleanup trigger for testing or immediate cleanup
   */
  async runManualCleanup() {
    console.log('[MEET CLEANUP] Running manual cleanup...');
    await this.performCleanup();
    console.log('[MEET CLEANUP] Manual cleanup completed');
  }

  /**
   * Get status of the cleanup service
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      cleanupIntervalMs: this.CLEANUP_INTERVAL_MS,
      deletionDelayHours: this.DELETION_DELAY_HOURS,
      nextCleanupIn: this.isRunning ? 
        `${Math.round(this.CLEANUP_INTERVAL_MS / (60 * 60 * 1000))} hours` : 
        'Service not running'
    };
  }

  /**
   * Get preview of meets that would be deleted without actually deleting them
   */
  async previewCleanup() {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - this.DELETION_DELAY_HOURS);
      const cutoffISO = cutoffTime.toISOString();

      const { data: meetsToDelete, error } = await supabase
        .from('meets')
        .select('id, title, date_time, starts_at, created_at')
        .or(`date_time.lt.${cutoffISO},starts_at.lt.${cutoffISO}`)
        .order('date_time', { ascending: true });

      if (error) {
        console.error('[MEET CLEANUP] Error previewing cleanup:', error);
        return [];
      }

      return meetsToDelete || [];
    } catch (error) {
      console.error('[MEET CLEANUP] Error in preview cleanup:', error);
      return [];
    }
  }
}

// Export singleton instance
export const meetCleanupService = new MeetCleanupService();

// Export class for testing
export default MeetCleanupService;

// Make available globally for debugging in development
if (__DEV__) {
  global.meetCleanup = {
    start: () => meetCleanupService.start(),
    stop: () => meetCleanupService.stop(),
    runNow: () => meetCleanupService.runManualCleanup(),
    status: () => meetCleanupService.getStatus(),
    preview: () => meetCleanupService.previewCleanup(),
  };
  console.log('🧹 Meet cleanup tools available in DEV:');
  console.log('🧹 global.meetCleanup.start() - Start auto-cleanup');
  console.log('🧹 global.meetCleanup.stop() - Stop auto-cleanup'); 
  console.log('🧹 global.meetCleanup.runNow() - Run cleanup now');
  console.log('🧹 global.meetCleanup.status() - Get service status');
  console.log('🧹 global.meetCleanup.preview() - Preview meets that would be deleted');
}