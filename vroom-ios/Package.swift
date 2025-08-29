// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "VroomApp",
    platforms: [
        .iOS(.v15)
    ],
    products: [
        .library(
            name: "VroomApp",
            targets: ["VroomApp"]),
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift", from: "2.0.0"),
        .package(url: "https://github.com/googleads/swift-package-manager-google-mobile-ads", from: "11.0.0")
    ],
    targets: [
        .target(
            name: "VroomApp",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift"),
                .product(name: "GoogleMobileAds", package: "swift-package-manager-google-mobile-ads")
            ]),
        .testTarget(
            name: "VroomAppTests",
            dependencies: ["VroomApp"]),
    ]
)