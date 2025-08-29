import SwiftUI

struct MoreView: View {
    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()
                
                VStack(spacing: 20) {
                    List {
                        NavigationLink(destination: GroupsView()) {
                            HStack {
                                Image(systemName: "person.3")
                                    .foregroundColor(.blue)
                                Text("Groups")
                                    .foregroundColor(.white)
                            }
                        }
                        .listRowBackground(Color.black)
                        
                        NavigationLink(destination: ForumsView()) {
                            HStack {
                                Image(systemName: "bubble.left.and.bubble.right")
                                    .foregroundColor(.blue)
                                Text("Forums")
                                    .foregroundColor(.white)
                            }
                        }
                        .listRowBackground(Color.black)
                        
                        NavigationLink(destination: MessagesView()) {
                            HStack {
                                Image(systemName: "message")
                                    .foregroundColor(.blue)
                                Text("Messages")
                                    .foregroundColor(.white)
                            }
                        }
                        .listRowBackground(Color.black)
                        
                        NavigationLink(destination: NotificationsView()) {
                            HStack {
                                Image(systemName: "bell")
                                    .foregroundColor(.blue)
                                Text("Notifications")
                                    .foregroundColor(.white)
                            }
                        }
                        .listRowBackground(Color.black)
                    }
                    .scrollContentBackground(.hidden)
                    .background(Color.black)
                }
            }
            .navigationTitle("More")
            .navigationBarTitleDisplayMode(.large)
        }
    }
}

#Preview {
    MoreView()
}