import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const TermsOfServiceScreen = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Last updated: {new Date().toLocaleDateString()}</Text>
        
        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>
          By accessing or using Vroom, you agree to be bound by these Terms of Service 
          and our Privacy Policy. If you do not agree to these terms, please do not use our service.
        </Text>

        <Text style={styles.sectionTitle}>2. Description of Service</Text>
        <Text style={styles.paragraph}>
          Vroom is a social media platform that allows users to create, share, and discover 
          video and photo content. Our service includes features for social interaction, 
          content discovery, messaging, and community participation.
        </Text>

        <Text style={styles.sectionTitle}>3. User Accounts</Text>
        <Text style={styles.paragraph}>
          You must create an account to use certain features of our service. You are responsible 
          for maintaining the security of your account and for all activities that occur under your account.
        </Text>

        <Text style={styles.sectionTitle}>4. User Content</Text>
        <Text style={styles.paragraph}>
          You retain ownership of content you upload to Vroom. By posting content, you grant us 
          a worldwide, non-exclusive license to use, display, and distribute your content on our platform. 
          You are responsible for ensuring you have the right to upload and share your content.
        </Text>

        <Text style={styles.sectionTitle}>5. Prohibited Conduct</Text>
        <Text style={styles.paragraph}>
          You agree not to:
        </Text>
        <Text style={styles.bulletPoint}>• Upload illegal, harmful, or offensive content</Text>
        <Text style={styles.bulletPoint}>• Harass, bully, or abuse other users</Text>
        <Text style={styles.bulletPoint}>• Impersonate others or create fake accounts</Text>
        <Text style={styles.bulletPoint}>• Spam or send unsolicited messages</Text>
        <Text style={styles.bulletPoint}>• Violate intellectual property rights</Text>
        <Text style={styles.bulletPoint}>• Attempt to hack or disrupt our services</Text>

        <Text style={styles.sectionTitle}>6. Content Moderation</Text>
        <Text style={styles.paragraph}>
          We reserve the right to remove content that violates these terms or our community guidelines. 
          We may also suspend or terminate accounts that repeatedly violate our policies.
        </Text>

        <Text style={styles.sectionTitle}>7. Privacy</Text>
        <Text style={styles.paragraph}>
          Your privacy is important to us. Please review our Privacy Policy to understand 
          how we collect, use, and protect your information.
        </Text>

        <Text style={styles.sectionTitle}>8. Intellectual Property</Text>
        <Text style={styles.paragraph}>
          The Vroom platform, including all software, designs, and trademarks, is owned by us 
          or our licensors. You may not copy, modify, or distribute our intellectual property 
          without permission.
        </Text>

        <Text style={styles.sectionTitle}>9. Termination</Text>
        <Text style={styles.paragraph}>
          You may delete your account at any time. We may suspend or terminate your account 
          if you violate these terms. Upon termination, your right to use our service ends immediately.
        </Text>

        <Text style={styles.sectionTitle}>10. Limitation of Liability</Text>
        <Text style={styles.paragraph}>
          Vroom is provided "as is" without warranties. We are not liable for any damages 
          arising from your use of our service, except as required by law.
        </Text>

        <Text style={styles.sectionTitle}>11. Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We may update these Terms of Service from time to time. We will notify you of 
          significant changes and your continued use of the service constitutes acceptance 
          of the updated terms.
        </Text>

        <Text style={styles.sectionTitle}>12. Contact Information</Text>
        <Text style={styles.paragraph}>
          If you have questions about these Terms of Service, please contact us at 
          legal@vroomapp.com or through the app's support section.
        </Text>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#00BFFF',
    marginBottom: 12,
    marginTop: 24,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    color: '#FFF',
    marginBottom: 16,
  },
  bulletPoint: {
    fontSize: 16,
    lineHeight: 24,
    color: '#FFF',
    marginBottom: 8,
    marginLeft: 16,
  },
  bottomSpacing: {
    height: 40,
  },
});

export default TermsOfServiceScreen;