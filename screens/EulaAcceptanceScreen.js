import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ensureUserProfile, updateUserProfile } from '../utils/profileHelpers';

export default function EulaAcceptanceScreen({ navigation }) {
  console.log('[EULA SCREEN] EulaAcceptanceScreen component rendered');
  
  const { refreshEulaStatus, forceSetEulaAccepted, eulaAccepted } = useAuth();
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [hasAcceptedPrivacy, setHasAcceptedPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);

  // Debug effect to track EULA state changes
  useEffect(() => {
    console.log('[EULA SCREEN] EULA accepted state changed to:', eulaAccepted);
  }, [eulaAccepted]);

  const handleAcceptAndContinue = async () => {
    console.log('[EULA SCREEN] handleAcceptAndContinue called', { hasAcceptedTerms, hasAcceptedPrivacy });
    
    if (!hasAcceptedTerms || !hasAcceptedPrivacy) {
      console.log('[EULA SCREEN] Missing acceptance - showing alert');
      Alert.alert(
        'Agreement Required', 
        'Please accept both the Terms of Service and Privacy Policy to continue.'
      );
      return;
    }

    console.log('[EULA SCREEN] All conditions met, starting instant EULA acceptance');
    
    // INSTANT UI UPDATE - Don't show loading, just accept immediately
    forceSetEulaAccepted(true);
    console.log('[EULA SCREEN] EULA accepted instantly in UI');
    
    // Fire and forget database update in background - don't await or block UI
    const updateInBackground = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          console.log('[EULA SCREEN] Updating database in background for user:', user.id);
          
          // Direct database update - no helper functions to avoid delays
          await supabase
            .from('profiles')
            .upsert({
              id: user.id,
              email: user.email,
              eula_accepted: true,
              eula_accepted_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'id'
            });
          
          console.log('[EULA SCREEN] Background database update completed successfully');
        }
      } catch (error) {
        console.error('[EULA SCREEN] Background database update failed (but UI already proceeded):', error);
        // Don't show error to user since UI already proceeded - this is background operation
      }
    };
    
    // Start background update but don't await it
    updateInBackground();
    
    console.log('[EULA SCREEN] EULA acceptance flow completed instantly');
  };

  const handleDeclineAndExit = () => {
    Alert.alert(
      'Exit App',
      'You must accept the Terms of Service and Privacy Policy to use Vroom Social.',
      [
        { text: 'Review Again', style: 'cancel' },
        { 
          text: 'Exit', 
          style: 'destructive',
          onPress: async () => {
            await supabase.auth.signOut();
          }
        },
      ]
    );
  };

  const ToggleCheckbox = ({ checked, onPress, label }) => (
    <TouchableOpacity style={styles.checkboxContainer} onPress={onPress}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={16} color="#fff" />}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <Text style={styles.logoText}>Welcome to Vroom Social</Text>
            <Ionicons name="car-sport" size={28} color="#00BFFF" style={{ marginLeft: 8 }} />
          </View>
          <Text style={styles.subtitleText}>Please review and accept our agreements</Text>
        </View>

        {/* Agreement Content */}
        <View style={styles.agreementContainer}>
          <Text style={styles.agreementTitle}>Terms & Privacy</Text>
          <Text style={styles.agreementText}>
            Before you can start using Vroom Social, please review and accept our Terms of Service and Privacy Policy. 
            These agreements outline your rights and responsibilities as a user of our platform.
          </Text>

          <View style={styles.linksContainer}>
            <TouchableOpacity 
              style={styles.linkButton}
              onPress={() => navigation.navigate('TermsOfService')}
            >
              <Ionicons name="document-text-outline" size={20} color="#00BFFF" />
              <Text style={styles.linkText}>Read Terms of Service</Text>
              <Ionicons name="chevron-forward" size={16} color="#00BFFF" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.linkButton}
              onPress={() => navigation.navigate('PrivacyPolicy')}
            >
              <Ionicons name="shield-checkmark-outline" size={20} color="#00BFFF" />
              <Text style={styles.linkText}>Read Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={16} color="#00BFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Checkboxes */}
        <View style={styles.checkboxSection}>
          <ToggleCheckbox
            checked={hasAcceptedTerms}
            onPress={() => setHasAcceptedTerms(!hasAcceptedTerms)}
            label="I have read and agree to the Terms of Service"
          />
          
          <ToggleCheckbox
            checked={hasAcceptedPrivacy}
            onPress={() => setHasAcceptedPrivacy(!hasAcceptedPrivacy)}
            label="I have read and agree to the Privacy Policy"
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.acceptButton,
              (!hasAcceptedTerms || !hasAcceptedPrivacy) && styles.acceptButtonDisabled
            ]}
            onPress={handleAcceptAndContinue}
            disabled={loading || !hasAcceptedTerms || !hasAcceptedPrivacy}
          >
            <Text style={[
              styles.acceptButtonText,
              (!hasAcceptedTerms || !hasAcceptedPrivacy) && styles.acceptButtonTextDisabled
            ]}>
              {loading ? 'Processing...' : 'Accept & Continue'}
            </Text>
            {!loading && <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.declineButton}
            onPress={handleDeclineAndExit}
            disabled={loading}
          >
            <Text style={styles.declineButtonText}>Decline & Exit</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footerText}>
          By continuing, you confirm that you are at least 13 years old and agree to our community guidelines.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0c10',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitleText: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
  agreementContainer: {
    marginBottom: 30,
  },
  agreementTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  agreementText: {
    fontSize: 16,
    color: '#ccc',
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  linksContainer: {
    marginBottom: 20,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  linkText: {
    color: '#00BFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginLeft: 12,
  },
  checkboxSection: {
    marginBottom: 30,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#555',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#00BFFF',
    borderColor: '#00BFFF',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#ccc',
    flex: 1,
    lineHeight: 20,
  },
  buttonContainer: {
    marginBottom: 30,
  },
  acceptButton: {
    backgroundColor: '#00BFFF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  acceptButtonDisabled: {
    backgroundColor: '#333',
  },
  acceptButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
  acceptButtonTextDisabled: {
    color: '#666',
  },
  declineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#666',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  declineButtonText: {
    color: '#999',
    fontSize: 16,
    fontWeight: '600',
  },
  footerText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
  },
});