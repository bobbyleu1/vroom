import React, { useState } from 'react';
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

const FAQScreen = () => {
  const navigation = useNavigation();
  const [expandedItems, setExpandedItems] = useState({});

  const toggleExpanded = (id) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const faqItems = [
    {
      id: 1,
      question: "How do I create an account?",
      answer: "To create an account, tap 'Sign Up' on the login screen, enter your email address, create a password, and follow the verification steps."
    },
    {
      id: 2,
      question: "How do I upload a video?",
      answer: "Tap the '+' button at the bottom of your screen, select or record a video, add a caption, and tap 'Post' to share it with your followers."
    },
    {
      id: 3,
      question: "Can I make my account private?",
      answer: "Yes! Go to Settings > Privacy & Security > Account Privacy and toggle 'Private Account' on. This means only approved followers can see your content."
    },
    {
      id: 4,
      question: "How do I report inappropriate content?",
      answer: "Tap the three dots (More) button on any post and select 'Report Post'. Choose the appropriate reason and we'll review it promptly."
    },
    {
      id: 5,
      question: "How do I block someone?",
      answer: "Go to their profile, tap the three dots in the top right corner, and select 'Block User'. You can also block someone from their posts using the More button."
    },
    {
      id: 6,
      question: "Can I save videos to watch later?",
      answer: "Yes! Tap the bookmark icon on any video to save it to your 'Saved' collection, which you can access from your profile."
    },
    {
      id: 7,
      question: "How do groups work?",
      answer: "Groups are communities around shared interests. You can join public groups or request to join private ones. Share content, discuss topics, and connect with like-minded users."
    },
    {
      id: 8,
      question: "What are forums?",
      answer: "Forums are discussion spaces where users can ask questions, share ideas, and have conversations about various topics. You can create posts, comment, and engage with the community."
    },
    {
      id: 9,
      question: "How do I change my profile picture?",
      answer: "Go to your profile, tap 'Edit Profile', then tap on your current profile picture to upload a new one from your photo library or take a new photo."
    },
    {
      id: 10,
      question: "Can I delete my account?",
      answer: "Yes, you can delete your account by going to Settings > Account > Delete Account. Please note that this action is permanent and cannot be undone."
    },
    {
      id: 11,
      question: "Why can't I see some users' content?",
      answer: "This could be because they have a private account and haven't approved your follow request, they've blocked you, or you've been restricted from viewing their content."
    },
    {
      id: 12,
      question: "How do I turn off notifications?",
      answer: "Go to Settings > Notifications and customize which types of notifications you want to receive. You can also turn off notifications entirely from your device's settings."
    }
  ];

  const FAQItem = ({ item }) => {
    const isExpanded = expandedItems[item.id];
    
    return (
      <View style={styles.faqItem}>
        <TouchableOpacity 
          onPress={() => toggleExpanded(item.id)}
          style={styles.questionContainer}
        >
          <Text style={styles.question}>{item.question}</Text>
          <Ionicons 
            name={isExpanded ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#00BFFF" 
          />
        </TouchableOpacity>
        
        {isExpanded && (
          <Text style={styles.answer}>{item.answer}</Text>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>FAQ</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Frequently Asked Questions</Text>
        
        {faqItems.map(item => (
          <FAQItem key={item.id} item={item} />
        ))}

        <View style={styles.contactSection}>
          <Text style={styles.contactTitle}>Still have questions?</Text>
          <Text style={styles.contactText}>
            If you can't find the answer you're looking for, please contact our support team 
            at support@vroomapp.com and we'll be happy to help!
          </Text>
        </View>

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
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 24,
    textAlign: 'center',
  },
  faqItem: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  questionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  question: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginRight: 12,
  },
  answer: {
    fontSize: 15,
    lineHeight: 22,
    color: '#CCC',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  contactSection: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#00BFFF',
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#00BFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  contactText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#FFF',
    textAlign: 'center',
  },
  bottomSpacing: {
    height: 40,
  },
});

export default FAQScreen;